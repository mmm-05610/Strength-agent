from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote, urlencode

import requests


@dataclass(frozen=True)
class VolcengineOcrConfig:
    access_key_id: str
    secret_access_key: str
    region: str
    service: str
    host: str
    action: str
    version: str
    image_field: str
    request_encoding: str
    timeout_seconds: float


def _is_probably_base64(value: str) -> bool:
    if not value:
        return False
    s = value.strip()
    if len(s) < 16 or len(s) % 4 != 0:
        return False
    if not re.fullmatch(r"[A-Za-z0-9+/]+={0,2}", s):
        return False
    return True


def _maybe_decode_base64_secret(secret: str) -> str:
    s = secret.strip()
    if not _is_probably_base64(s):
        return s

    try:
        decoded = base64.b64decode(s, validate=True)
    except Exception:
        return s

    try:
        text = decoded.decode("utf-8").strip()
    except Exception:
        return s

    if len(text) < 16:
        return s

    # Basic sanity: printable-ish.
    if any(ord(ch) < 32 for ch in text):
        return s

    return text


def _sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _hmac_sha256(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def _derive_signing_key(secret: str, date_stamp: str, region: str, service: str) -> bytes:
    # Volcengine HMAC-SHA256 signing key derivation:
    # kDate=HMAC(kSecret, Date) -> kRegion -> kService -> kSigning=HMAC(kService, "request")
    # (No AWS4/VOLC4 prefix)
    k_date = _hmac_sha256(secret.encode("utf-8"), date_stamp)
    k_region = _hmac_sha256(k_date, region)
    k_service = _hmac_sha256(k_region, service)
    k_signing = _hmac_sha256(k_service, "request")
    return k_signing


class VolcengineOcrClient:
    def __init__(self) -> None:
        access_key_id = os.getenv("VOLCENGINE_ACCESS_KEY_ID", "").strip()
        secret_access_key_raw = os.getenv("VOLCENGINE_SECRET_ACCESS_KEY", "").strip()

        # SecretAccessKey 通常就是原始字符串；不要猜测/自动 base64 解码（很容易把正常的 SK 误判为 base64）。
        secret_access_key = secret_access_key_raw
        if os.getenv("VOLCENGINE_SECRET_ACCESS_KEY_BASE64", "").strip().lower() in {"1", "true", "yes"}:
            secret_access_key = _maybe_decode_base64_secret(secret_access_key_raw)

        self._config = VolcengineOcrConfig(
            access_key_id=access_key_id,
            secret_access_key=secret_access_key,
            region=os.getenv("VOLCENGINE_REGION", "cn-beijing").strip() or "cn-beijing",
            # Volcengine Visual APIs typically use service name "cv" in the v4 signing scope.
            service=os.getenv("VOLCENGINE_SERVICE", "cv").strip() or "cv",
            host=os.getenv("VOLCENGINE_OCR_HOST", "visual.volcengineapi.com").strip() or "visual.volcengineapi.com",
            action=os.getenv("VOLCENGINE_OCR_ACTION", "OCRNormal").strip() or "OCRNormal",
            version=os.getenv("VOLCENGINE_OCR_VERSION", "2020-08-26").strip() or "2020-08-26",
            # The official Volcengine VisualService examples use form fields like `image_base64`.
            image_field=os.getenv("VOLCENGINE_OCR_IMAGE_FIELD", "image_base64").strip() or "image_base64",
            # Visual OCRNormal is typically a form POST; keep JSON as an escape hatch.
            request_encoding=os.getenv("VOLCENGINE_OCR_REQUEST_ENCODING", "form").strip().lower() or "form",
            timeout_seconds=float(os.getenv("VOLCENGINE_OCR_TIMEOUT", "45")),
        )

    def is_configured(self) -> bool:
        return bool(self._config.access_key_id and self._config.secret_access_key)

    def describe(self) -> dict[str, Any]:
        return {
            "provider": "volcengine",
            "configured": self.is_configured(),
            "host": self._config.host,
            "region": self._config.region,
            "service": self._config.service,
            "action": self._config.action,
            "version": self._config.version,
        }

    def ocr_image_base64(self, image_b64: str) -> dict[str, Any]:
        if not self.is_configured():
            raise RuntimeError("VOLCENGINE_ACCESS_KEY_ID / VOLCENGINE_SECRET_ACCESS_KEY is not configured")

        cfg = self._config
        method = "POST"
        canonical_uri = "/"

        query_params = {
            "Action": cfg.action,
            "Version": cfg.version,
        }

        # Canonical query string (sorted, RFC3986-encoded)
        canonical_query = "&".join(
            f"{quote(k, safe='-_.~')}={quote(str(v), safe='-_.~')}" for k, v in sorted(query_params.items())
        )

        if cfg.request_encoding == "json":
            content_type = "application/json"
            body = json.dumps({cfg.image_field: image_b64}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        else:
            # Match Volcengine Python SDK `common_handler` style: x-www-form-urlencoded.
            content_type = "application/x-www-form-urlencoded"
            body = urlencode({cfg.image_field: image_b64}).encode("utf-8")

        payload_hash = _sha256_hex(body)

        now = datetime.now(timezone.utc)
        amz_date = now.strftime("%Y%m%dT%H%M%SZ")
        date_stamp = now.strftime("%Y%m%d")

        # Follow Volcengine signing example order to avoid SignatureDoesNotMatch.
        canonical_headers = (
            f"host:{cfg.host}\n"
            f"x-date:{amz_date}\n"
            f"x-content-sha256:{payload_hash}\n"
            f"content-type:{content_type}\n"
        )
        signed_headers = "host;x-date;x-content-sha256;content-type"

        canonical_request = (
            f"{method}\n"
            f"{canonical_uri}\n"
            f"{canonical_query}\n"
            f"{canonical_headers}\n"
            f"{signed_headers}\n"
            f"{payload_hash}"
        )

        credential_scope = f"{date_stamp}/{cfg.region}/{cfg.service}/request"
        string_to_sign = (
            "HMAC-SHA256\n"
            f"{amz_date}\n"
            f"{credential_scope}\n"
            f"{_sha256_hex(canonical_request.encode('utf-8'))}"
        )

        signing_key = _derive_signing_key(cfg.secret_access_key, date_stamp, cfg.region, cfg.service)
        signature = hmac.new(signing_key, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

        authorization = (
            "HMAC-SHA256 "
            f"Credential={cfg.access_key_id}/{credential_scope}, "
            f"SignedHeaders={signed_headers}, "
            f"Signature={signature}"
        )

        url = f"https://{cfg.host}{canonical_uri}"
        response = requests.post(
            url,
            params=query_params,
            data=body,
            headers={
                "Accept": "application/json",
                "Content-Type": content_type,
                "Host": cfg.host,
                "X-Date": amz_date,
                "X-Content-Sha256": payload_hash,
                "Authorization": authorization,
            },
            timeout=cfg.timeout_seconds,
        )
        response.raise_for_status()
        return response.json()
