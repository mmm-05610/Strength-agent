import argparse
import json
import os
from pathlib import Path

import requests
from requests import exceptions as req_exc


def _pretty(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=2)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="One-click OCR validation: upload an InBody image to backend and print extracted metrics.",
    )
    parser.add_argument("image", nargs="?", default=None, help="Path to an image file (jpeg/png/webp)")
    parser.add_argument("--base-url", default=os.getenv("API_BASE", "http://127.0.0.1:8000"))
    parser.add_argument("--captured-on", default=os.getenv("CAPTURED_ON"), help="YYYY-MM-DD")
    parser.add_argument("--timeout", type=float, default=60.0)
    args = parser.parse_args()

    if args.image:
        img_path = Path(args.image)
    else:
        candidates = [
            Path("../../asssets/4.6.jpg"),
            Path("../../asssets/4.15.jpg"),
        ]
        img_path = next((p for p in candidates if p.exists() and p.is_file()), None)

        if img_path is None:
            uploads = Path("uploads")
            if uploads.exists():
                imgs = [
                    p
                    for p in uploads.glob("*.*")
                    if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"} and p.is_file()
                ]
                if imgs:
                    img_path = max(imgs, key=lambda p: p.stat().st_mtime)

        if img_path is None:
            raise SystemExit(
                "Missing image argument and no default sample found. "
                "Provide an image path, or add samples under ../asssets/, or ensure uploads/ has images."
            )

        print(f"INFO: no image arg provided, using: {img_path}")

    if not img_path.exists() or not img_path.is_file():
        raise SystemExit(f"Image not found: {img_path}")

    base_url = str(args.base_url).rstrip("/")

    try:
        status_res = requests.get(f"{base_url}/api/v1/ocr/status", timeout=args.timeout)
        status_res.raise_for_status()
        print("/api/v1/ocr/status =>")
        print(_pretty(status_res.json()))
    except Exception as exc:  # noqa: BLE001
        print(f"WARN: failed to query OCR status: {exc}")

    suffix = img_path.suffix.lower()
    mime = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }.get(suffix)
    if not mime:
        raise SystemExit(f"Unsupported image extension: {suffix} (use .jpg/.png/.webp)")

    with img_path.open("rb") as f:
        files = {"file": (img_path.name, f, mime)}
        data = {}
        if args.captured_on:
            data["captured_on"] = args.captured_on
        data["title"] = f"InBody {args.captured_on or ''}".strip() or "InBody OCR Validation"
        data["tags"] = "inbody,ocr,validate"

        try:
            res = requests.post(
                f"{base_url}/api/v1/body-metrics/ocr",
                files=files,
                data=data,
                timeout=args.timeout,
            )
        except req_exc.RequestException as exc:
            print(f"ERROR: failed to call backend: {exc}")
            print("HINT: start backend server first, e.g. in mvp/backend:")
            print("  .\\.venv\\Scripts\\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000")
            return 2

    print(f"\nPOST /api/v1/body-metrics/ocr => HTTP {res.status_code}")
    if not res.ok:
        print(res.text)
        return 2

    payload = res.json()

    # Avoid dumping extremely long raw output.
    raw = payload.get("raw_output")
    if isinstance(raw, str) and len(raw) > 2000:
        payload["raw_output"] = raw[:2000] + "\n... (truncated)"

    print(_pretty(payload))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
