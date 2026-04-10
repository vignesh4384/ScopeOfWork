from __future__ import annotations

import abc
from collections.abc import AsyncIterator
from typing import Any, List


class LLMProvider(abc.ABC):
    @abc.abstractmethod
    async def classify(self, prompt: str) -> str:
        ...

    @abc.abstractmethod
    async def generate(self, messages: List[dict[str, str]], **kwargs: Any) -> str:
        ...

    async def generate_structured(
        self,
        messages: List[dict[str, str]],
        tools: list[dict],
        tool_choice: dict,
        **kwargs: Any,
    ) -> dict:
        """Generate a structured response using tool_use. Returns the tool input dict."""
        raise NotImplementedError("generate_structured not implemented for this provider")

    async def generate_stream(
        self, messages: List[dict[str, str]], **kwargs: Any
    ) -> AsyncIterator[str]:
        """Stream text chunks from the LLM. Yields strings as they arrive."""
        raise NotImplementedError("generate_stream not implemented for this provider")
        # Make this an async generator so subclasses can use `yield`
        yield ""  # type: ignore[unreachable]
