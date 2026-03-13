from __future__ import annotations

from typing import Any, List

import asyncio
from openai import AsyncAzureOpenAI

import config
from llm_providers.base import LLMProvider


class AzureOpenAILLMProvider(LLMProvider):
    def __init__(self) -> None:
        self.enabled = bool(config.settings.azure_openai_endpoint and config.settings.azure_openai_key)
        self.client = (
            AsyncAzureOpenAI(
                api_key=config.settings.azure_openai_key,
                azure_endpoint=config.settings.azure_openai_endpoint,
                api_version="2025-01-01-preview",
            )
            if self.enabled
            else None
        )
        self.deployment = config.settings.azure_openai_deployment

    async def classify(self, prompt: str) -> str:
        if not self.enabled or not self.client:
            return self._fallback_classify(prompt)
        try:
            resp = await asyncio.wait_for(
                self.client.chat.completions.create(
                    model=self.deployment,
                    temperature=0,
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "Classify the request as either 'material' (tangible item) or 'service' (work performed). "
                                "Reply with exactly one word: material or service."
                            ),
                        },
                        {"role": "user", "content": prompt},
                    ],
                ),
                timeout=5,
            )
            text = (resp.choices[0].message.content or "").strip().lower()
            return "service" if "service" in text else "material"
        except Exception:
            return self._fallback_classify(prompt)

    async def generate(self, messages: List[dict[str, str]], **kwargs: Any) -> str:
        if not self.enabled or not self.client:
            return self._fallback_generate(messages)
        try:
            resp = await asyncio.wait_for(
                self.client.chat.completions.create(
                    model=self.deployment,
                    temperature=0.3,
                    messages=messages,
                ),
                timeout=8,
            )
            return resp.choices[0].message.content or ""
        except Exception:
            return self._fallback_generate(messages)

    @staticmethod
    def _fallback_classify(prompt: str) -> str:
        lower = prompt.lower()
        if any(word in lower for word in ["install", "consult", "support", "maintenance", "service"]):
            return "service"
        return "material"

    @staticmethod
    def _fallback_generate(messages: List[dict[str, str]]) -> str:
        last = messages[-1]["content"] if messages else ""
        return f"(stubbed response) {last}"


def get_provider() -> LLMProvider:
    return AzureOpenAILLMProvider()
