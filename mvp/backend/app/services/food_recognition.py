"""Food image recognition via 百度AI + nutrition lookup via 天聚数行.

Degrades gracefully when API keys are not configured.
"""

from __future__ import annotations

import base64
import os
from typing import Any

import requests


class FoodRecognitionClient:
    """Composite client: 百度AI for image→dish, 天聚数行 for dish→nutrition."""

    def __init__(self) -> None:
        # 百度AI
        self.baidu_app_id = os.getenv("BAIDU_AI_APP_ID", "")
        self.baidu_api_key = os.getenv("BAIDU_AI_API_KEY", "")
        self.baidu_secret_key = os.getenv("BAIDU_AI_SECRET_KEY", "")
        self.baidu_token: str | None = None

        # 天聚数行
        self.tianapi_key = os.getenv("TIANAPI_KEY", "")

    # ------------------------------------------------------------------
    # 百度AI access token
    # ------------------------------------------------------------------
    def _fetch_baidu_token(self) -> str | None:
        if not self.baidu_api_key or not self.baidu_secret_key:
            return None
        try:
            resp = requests.get(
                "https://aip.baidubce.com/oauth/2.0/token",
                params={
                    "grant_type": "client_credentials",
                    "client_id": self.baidu_api_key,
                    "client_secret": self.baidu_secret_key,
                },
                timeout=10,
            )
            resp.raise_for_status()
            return resp.json().get("access_token")
        except Exception:
            return None

    def _ensure_baidu_token(self) -> str | None:
        if not self.baidu_token:
            self.baidu_token = self._fetch_baidu_token()
        return self.baidu_token

    # ------------------------------------------------------------------
    # 百度AI 菜品识别
    # ------------------------------------------------------------------
    def recognize_dish(self, image_bytes: bytes) -> dict[str, Any]:
        """Recognize food from image. Returns {dishes: [{name, calorie, probability}]}."""
        token = self._ensure_baidu_token()
        if not token:
            return {"status": "not_configured", "dishes": []}

        try:
            resp = requests.post(
                f"https://aip.baidubce.com/rest/2.0/image-classify/v2/dish",
                params={"access_token": token},
                data={
                    "image": base64.b64encode(image_bytes).decode("utf-8"),
                    "top_num": 3,
                    "filter_threshold": 0.5,
                    "baike_num": 0,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=15,
            )
            resp.raise_for_status()
            result = resp.json()

            dishes = []
            for item in result.get("result", []):
                dishes.append({
                    "name": item.get("name", ""),
                    "calorie": item.get("calorie", ""),
                    "probability": item.get("probability", 0),
                })

            return {"status": "ok", "dishes": dishes}
        except Exception as e:
            return {"status": "error", "message": str(e), "dishes": []}

    # ------------------------------------------------------------------
    # 天聚数行 食物营养查询
    # ------------------------------------------------------------------
    def lookup_nutrition(self, food_name: str) -> dict[str, Any]:
        """Look up detailed nutrition info for a food name."""
        if not self.tianapi_key:
            return {"status": "not_configured", "nutrients": None}

        try:
            resp = requests.get(
                "https://apis.tianapi.com/nutrient/index",
                params={"key": self.tianapi_key, "word": food_name},
                timeout=10,
            )
            resp.raise_for_status()
            data = resp.json()

            if data.get("code") != 200:
                return {"status": "not_found", "nutrients": None, "message": data.get("msg", "")}

            newslist = data.get("result", {}).get("list", [])
            if not newslist:
                return {"status": "not_found", "nutrients": None}

            # Return the first match with key nutrition fields
            item = newslist[0]
            return {
                "status": "ok",
                "nutrients": {
                    "food_name": item.get("name", food_name),
                    "calories_kcal_per_100g": _parse_float(item.get("calorie")),
                    "protein_g_per_100g": _parse_float(item.get("protein")),
                    "fat_g_per_100g": _parse_float(item.get("fat")),
                    "carbs_g_per_100g": _parse_float(item.get("carbohydrate")),
                    "fiber_g_per_100g": _parse_float(item.get("fiber")),
                },
            }
        except Exception as e:
            return {"status": "error", "message": str(e), "nutrients": None}

    # ------------------------------------------------------------------
    # Composite: image → dish → nutrition
    # ------------------------------------------------------------------
    def image_to_nutrition(self, image_bytes: bytes) -> dict[str, Any]:
        """Full pipeline: image → dish recognition → nutrition lookup."""
        dish_result = self.recognize_dish(image_bytes)

        if dish_result["status"] != "ok" or not dish_result["dishes"]:
            return {
                "status": dish_result["status"],
                "message": dish_result.get("message", "No dishes recognized"),
                "dishes": dish_result["dishes"],
                "nutrition": None,
            }

        # Look up nutrition for top dish
        top_dish = dish_result["dishes"][0]
        nutrition_result = self.lookup_nutrition(top_dish["name"])

        return {
            "status": dish_result["status"],
            "dishes": dish_result["dishes"],
            "nutrition": nutrition_result.get("nutrients"),
            "nutrition_status": nutrition_result.get("status"),
        }


def _parse_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


# Module-level singleton
food_client = FoodRecognitionClient()
