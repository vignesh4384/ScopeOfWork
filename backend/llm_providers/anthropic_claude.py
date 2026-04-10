from __future__ import annotations

import httpx
import asyncio
import json as _json
from collections.abc import AsyncIterator
from typing import List, Any

import config
from llm_providers.base import LLMProvider


class AnthropicLLMProvider(LLMProvider):
    def __init__(self) -> None:
        self.api_key = config.settings.anthropic_api_key
        self.model = config.settings.anthropic_model
        self.enabled = bool(self.api_key and self.model)
        self.endpoint = "https://api.anthropic.com/v1/messages"
        self.client = httpx.AsyncClient(timeout=180)

    async def classify(self, prompt: str) -> str:
        if not self.enabled:
            return self._fallback_classify(prompt)
        try:
            resp = await asyncio.wait_for(
                self._send(
                    system="Classify the procurement request as 'material' (tangible goods/equipment to purchase) or 'service' (work performed by people — inspection, maintenance, consulting, construction, testing, monitoring, etc.). Reply with exactly one word: material or service.",
                    messages=[{"role": "user", "content": prompt}],
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
            system_text, coalesced = self._prepare_messages(messages)
            resp = await asyncio.wait_for(
                self._send(system=system_text, messages=coalesced, max_tokens=config.settings.chat_max_tokens),
                timeout=120,
            )
            return resp
        except Exception as e:
            print(f"[Anthropic] generate failed: {type(e).__name__}: {e}")
            return self._fallback_generate(messages)

    async def generate_structured(
        self,
        messages: List[dict[str, str]],
        tools: list[dict],
        tool_choice: dict,
        **kwargs: Any,
    ) -> dict:
        """Generate a structured response via tool_use. Returns the tool input dict."""
        if not self.enabled:
            return {"scope_document": "", "agent_reply": "(provider disabled)", "changes_summary": ""}
        try:
            system_text, coalesced = self._prepare_messages(messages)
            resp = await asyncio.wait_for(
                self._send(
                    system=system_text,
                    messages=coalesced,
                    max_tokens=config.settings.chat_max_tokens,
                    tools=tools,
                    tool_choice=tool_choice,
                ),
                timeout=config.settings.chat_llm_timeout,
            )
            if isinstance(resp, dict):
                return resp
            return {"scope_document": resp, "agent_reply": "Scope updated.", "changes_summary": ""}
        except Exception as e:
            print(f"[Anthropic] generate_structured failed: {type(e).__name__}: {e}")
            raise

    @staticmethod
    def _prepare_messages(messages: List[dict[str, str]]) -> tuple[str, list[dict[str, str]]]:
        """Separate system from conversation messages, coalesce same-role runs."""
        system_parts = [m["content"] for m in messages if m["role"] == "system"]
        system_text = "\n".join(system_parts) if system_parts else ""

        convo: list[dict[str, str]] = []
        for m in messages:
            role = m.get("role")
            if role in ("user", "assistant"):
                convo.append({"role": role, "content": m.get("content", "")})

        coalesced: list[dict[str, str]] = []
        for msg in convo:
            if coalesced and coalesced[-1]["role"] == msg["role"]:
                coalesced[-1]["content"] += "\n" + msg["content"]
            else:
                coalesced.append(dict(msg))

        if not coalesced:
            coalesced = [{"role": "user", "content": ""}]
        if coalesced[0]["role"] != "user":
            coalesced.insert(0, {"role": "user", "content": "(continue)"})

        return system_text, coalesced

    async def generate_stream(
        self, messages: List[dict[str, str]], **kwargs: Any
    ) -> AsyncIterator[str]:
        """Stream text chunks from Claude using SSE. Yields text deltas."""
        if not self.enabled:
            yield "(streaming not available — provider disabled)"
            return

        system_text, coalesced = self._prepare_messages(messages)

        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "prompt-caching-2024-07-31",
            "content-type": "application/json",
        }
        system_payload = (
            [{"type": "text", "text": system_text, "cache_control": {"type": "ephemeral"}}]
            if system_text
            else []
        )
        payload = {
            "model": self.model,
            "max_tokens": config.settings.chat_max_tokens,
            "system": system_payload,
            "messages": coalesced,
            "stream": True,
        }

        async with self.client.stream("POST", self.endpoint, headers=headers, json=payload) as response:
            response.raise_for_status()
            buf = ""
            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data_str = line[6:]
                if data_str.strip() == "[DONE]":
                    break
                try:
                    event = _json.loads(data_str)
                except _json.JSONDecodeError:
                    continue
                event_type = event.get("type", "")
                if event_type == "content_block_delta":
                    delta = event.get("delta", {})
                    if delta.get("type") == "text_delta":
                        text = delta.get("text", "")
                        if text:
                            yield text
                elif event_type == "message_stop":
                    break

    async def _send(
        self,
        system: str,
        messages: list[dict[str, str]],
        max_tokens: int,
        *,
        tools: list[dict] | None = None,
        tool_choice: dict | None = None,
    ) -> str | dict:
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "prompt-caching-2024-07-31",
            "content-type": "application/json",
        }
        # Use cacheable array format for system prompt (prompt caching)
        system_payload: list[dict] | str = (
            [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]
            if system
            else []
        )
        payload: dict = {
            "model": self.model,
            "max_tokens": max_tokens,
            "system": system_payload,
            "messages": messages,
        }
        if tools:
            payload["tools"] = tools
        if tool_choice:
            payload["tool_choice"] = tool_choice

        res = await self.client.post(self.endpoint, headers=headers, json=payload)
        res.raise_for_status()
        data = res.json()

        # Log cache metrics
        usage = data.get("usage", {})
        cache_read = usage.get("cache_read_input_tokens", 0)
        cache_create = usage.get("cache_creation_input_tokens", 0)
        if cache_read or cache_create:
            print(f"[Anthropic] cache_read={cache_read} cache_create={cache_create}")

        # Parse response — handle both text and tool_use content blocks
        if "content" in data and isinstance(data["content"], list):
            for block in data["content"]:
                if block.get("type") == "tool_use":
                    return block.get("input", {})
            for block in data["content"]:
                if block.get("type") == "text":
                    return block.get("text", "")
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
