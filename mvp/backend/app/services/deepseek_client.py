from __future__ import annotations

import json
import os
from typing import Any, Generator

import requests


class DeepSeekClient:
    def __init__(self) -> None:
        self.api_key = os.getenv("DEEPSEEK_API_KEY", "")
        self.base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def chat_completion(
        self,
        model: str,
        messages: list[dict[str, Any]],
        max_tokens: int,
        temperature: float = 0.4,
    ) -> dict[str, Any]:
        if not self.api_key:
            raise RuntimeError("DEEPSEEK_API_KEY is not configured")

        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }

        response = requests.post(
            f"{self.base_url.rstrip('/')}/chat/completions",
            json=payload,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            timeout=45,
        )
        response.raise_for_status()
        return response.json()

    def chat_completion_stream(
        self,
        model: str,
        messages: list[dict[str, Any]],
        max_tokens: int,
        temperature: float = 0.4,
    ) -> Generator[dict[str, Any], None, None]:
        """Streaming chat completion. Yields dicts: {"type":"token","content":...} or {"type":"meta","usage":{...}}"""
        if not self.api_key:
            raise RuntimeError("DEEPSEEK_API_KEY is not configured")

        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": True,
            "stream_options": {"include_usage": True},
        }

        response = requests.post(
            f"{self.base_url.rstrip('/')}/chat/completions",
            json=payload,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            timeout=60,
            stream=True,
        )
        response.raise_for_status()

        for line in response.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data: "):
                continue
            data_str = line[6:]
            if data_str == "[DONE]":
                break
            try:
                data = json.loads(data_str)
                choices = data.get("choices", [])
                if choices:
                    delta = choices[0].get("delta", {})
                    content = delta.get("content", "")
                    if content:
                        yield {"type": "token", "content": content}
                # Final chunk may contain usage
                usage = data.get("usage")
                if usage:
                    yield {
                        "type": "meta",
                        "usage": {
                            "prompt_tokens": usage.get("prompt_tokens", 0),
                            "completion_tokens": usage.get("completion_tokens", 0),
                            "total_tokens": usage.get("total_tokens", 0),
                        },
                    }
            except (json.JSONDecodeError, KeyError, IndexError):
                continue
