from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Generator

import requests

LOG_DIR = Path(__file__).resolve().parents[2] / "log"


def _write_log(model: str, request_payload: dict[str, Any], response_data: dict[str, Any]) -> None:
    """Write full request and response to log/{model}/{timestamp}/ directory."""
    safe_model = model.replace("/", "_").replace("\\", "_").replace(":", "_")
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S-%f")[:23]
    call_dir = LOG_DIR / safe_model / ts
    call_dir.mkdir(parents=True, exist_ok=True)

    (call_dir / "request.json").write_text(
        json.dumps(request_payload, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )
    (call_dir / "response.json").write_text(
        json.dumps(response_data, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )


class DeepSeekClient:
    def __init__(self) -> None:
        self.api_key = os.getenv("DEEPSEEK_API_KEY", "")
        self.base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
        self.default_model = os.getenv("DEEPSEEK_CHAT_MODEL", "deepseek-chat")
        self.vl_model = os.getenv("DEEPSEEK_VL2_MODEL", "deepseek-vl2")

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def _build_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def chat_completion(
        self,
        model: str | None = None,
        messages: list[dict[str, Any]] | None = None,
        max_tokens: int = 1024,
        temperature: float = 0.4,
        tools: list[dict[str, Any]] | None = None,
        tool_choice: str | dict[str, Any] | None = None,
        thinking_enabled: bool = False,
    ) -> dict[str, Any]:
        if not self.api_key:
            raise RuntimeError("DEEPSEEK_API_KEY is not configured")

        _model = model or self.default_model
        payload: dict[str, Any] = {
            "model": _model,
            "messages": messages or [],
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if thinking_enabled:
            payload["thinking"] = {"type": "enabled"}
        if tools:
            payload["tools"] = tools
            if tool_choice:
                payload["tool_choice"] = tool_choice

        response = requests.post(
            f"{self.base_url.rstrip('/')}/v1/chat/completions",
            json=payload,
            headers=self._build_headers(),
            timeout=60,
        )
        response.raise_for_status()
        result = response.json()

        # Log full request + response
        try:
            _write_log(_model, payload, result)
        except Exception:
            pass

        return result

    def chat_completion_stream(
        self,
        model: str | None = None,
        messages: list[dict[str, Any]] | None = None,
        max_tokens: int = 1024,
        temperature: float = 0.4,
        tools: list[dict[str, Any]] | None = None,
        tool_choice: str | dict[str, Any] | None = None,
        thinking_enabled: bool = False,
    ) -> Generator[dict[str, Any], None, None]:
        """Streaming chat completion. Also logs full request + response to disk.

        Yields dicts:
          {"type":"token","content":"..."}
          {"type":"thinking","content":"..."}
          {"type":"tool_call","id":"...","name":"...","arguments":"..."}
          {"type":"meta","usage":{...}}
        """
        if not self.api_key:
            raise RuntimeError("DEEPSEEK_API_KEY is not configured")

        _model = model or self.default_model
        payload: dict[str, Any] = {
            "model": _model,
            "messages": messages or [],
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if thinking_enabled:
            payload["thinking"] = {"type": "enabled"}
        if tools:
            payload["tools"] = tools
            if tool_choice:
                payload["tool_choice"] = tool_choice

        response = requests.post(
            f"{self.base_url.rstrip('/')}/v1/chat/completions",
            json=payload,
            headers=self._build_headers(),
            timeout=120,
            stream=True,
        )
        response.raise_for_status()

        tool_call_acc: dict[int, dict[str, Any]] = {}
        tool_calls_yielded = False
        all_events: list[dict[str, Any]] = []
        final_usage: dict[str, Any] = {}
        finish_reason = ""

        for line in response.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data: "):
                continue
            data_str = line[6:]
            if data_str == "[DONE]":
                break
            try:
                data = json.loads(data_str)
                all_events.append(data)
                choices = data.get("choices", [])
                if choices:
                    delta = choices[0].get("delta", {})
                    finish_reason = choices[0].get("finish_reason", "") or finish_reason

                    reasoning = delta.get("reasoning_content", "")
                    if reasoning:
                        yield {"type": "thinking", "content": reasoning}

                    tool_calls_delta = delta.get("tool_calls")
                    if tool_calls_delta:
                        for tc in tool_calls_delta:
                            idx = tc.get("index", 0)
                            if idx not in tool_call_acc:
                                tool_call_acc[idx] = {"id": tc.get("id", ""), "name": "", "arguments": ""}
                            acc = tool_call_acc[idx]
                            if tc.get("id"):
                                acc["id"] = tc["id"]
                            if tc.get("function", {}).get("name"):
                                acc["name"] = tc["function"]["name"]
                            if tc.get("function", {}).get("arguments"):
                                acc["arguments"] += tc["function"]["arguments"]

                    if finish_reason == "tool_calls" and not tool_calls_yielded:
                        tool_calls_yielded = True
                        for idx in sorted(tool_call_acc.keys()):
                            yield {
                                "type": "tool_call",
                                "id": tool_call_acc[idx]["id"],
                                "name": tool_call_acc[idx]["name"],
                                "arguments": tool_call_acc[idx]["arguments"],
                            }

                    content = delta.get("content", "")
                    if content:
                        yield {"type": "token", "content": content}

                usage = data.get("usage")
                if usage:
                    final_usage = {
                        "prompt_tokens": usage.get("prompt_tokens", 0),
                        "completion_tokens": usage.get("completion_tokens", 0),
                        "total_tokens": usage.get("total_tokens", 0),
                    }
                    yield {"type": "meta", "usage": final_usage}
            except (json.JSONDecodeError, KeyError, IndexError):
                continue

        # Log full request + accumulated response
        try:
            _write_log(
                _model,
                payload,
                {
                    "finish_reason": finish_reason,
                    "tool_calls": [{"index": idx, **tc} for idx, tc in sorted(tool_call_acc.items())] if tool_call_acc else [],
                    "usage": final_usage,
                    "raw_events": all_events,
                },
            )
        except Exception:
            pass
