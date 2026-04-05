from __future__ import annotations

import httpx
import asyncio
from typing import List, Any

import config
from llm_providers.base import LLMProvider


class AnthropicLLMProvider(LLMProvider):
    def __init__(self) -> None:
        self.api_key = config.settings.anthropic_api_key
        self.model = config.settings.anthropic_model
        self.enabled = bool(self.api_key and self.model)
        self.endpoint = "https://api.anthropic.com/v1/messages"
        self.client = httpx.AsyncClient(timeout=90)

    async def classify(self, prompt: str) -> str:
        if not self.enabled:
            return self._fallback_classify(prompt)
        try:
            resp = await asyncio.wait_for(
                self._send(
                    system="Classify the procurement request as 'material' (tangible goods/equipment to purchase) or 'service' (work performed by people — inspection, maintenance, consulting, construction, testing, monitoring, etc.). Reply with exactly one word: material or service.",
                    user=prompt,
                    max_tokens=10,
                ),
                timeout=12,
            )
            text = resp.strip().lower()
            return "service" if "service" in text else "material"
        except Exception:
            return self._fallback_classify(prompt)

    async def generate(self, messages: List[dict[str, str]], **kwargs: Any) -> str:
        if not self.enabled:
            print(f"[Anthropic] generate called but provider disabled")
            return self._fallback_generate(messages)
        try:
            # Convert OpenAI-style messages to Anthropic format
            system_parts = [m["content"] for m in messages if m["role"] == "system"]
            system_text = "\n".join(system_parts) if system_parts else ""
            user_parts = [m["content"] for m in messages if m["role"] == "user"]
            user_text = "\n".join(user_parts)
            resp = await asyncio.wait_for(
                self._send(system=system_text, user=user_text, max_tokens=4000),
                timeout=90,
            )
            return resp
        except Exception as e:
            print(f"[Anthropic] generate failed: {type(e).__name__}: {e}")
            return self._fallback_generate(messages)

    async def _send(self, system: str, user: str, max_tokens: int) -> str:
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
        payload = {
            "model": self.model,
            "max_tokens": max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        }
        res = await self.client.post(self.endpoint, headers=headers, json=payload)
        res.raise_for_status()
        data = res.json()
        # Claude returns content as list of blocks
        if "content" in data and isinstance(data["content"], list) and data["content"]:
            return data["content"][0].get("text", "")
        return ""

    @staticmethod
    def _fallback_classify(prompt: str) -> str:
        lower = prompt.lower()
        service_keywords = [
            "install", "consult", "support", "maintenance", "service",
            "inspection", "inspect", "pigging", "monitoring", "survey",
            "testing", "calibration", "repair", "overhaul", "cleaning",
            "construction", "commissioning", "decommissioning", "demolition",
            "audit", "assessment", "analysis", "ndt", "welding", "coating",
            "scaffolding", "insulation", "transportation", "logistics",
            "training", "engineering", "design", "study", "review",
        ]
        if any(word in lower for word in service_keywords):
            return "service"
        return "material"

    @staticmethod
    def _fallback_generate(messages: List[dict[str, str]]) -> str:
        last = messages[-1]["content"] if messages else ""
        return f"(fallback stub) {last}"


def get_provider() -> LLMProvider:
    return AnthropicLLMProvider()
