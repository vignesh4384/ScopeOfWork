from __future__ import annotations

import abc
from typing import Any, List


class LLMProvider(abc.ABC):
    @abc.abstractmethod
    async def classify(self, prompt: str) -> str:
        ...

    @abc.abstractmethod
    async def generate(self, messages: List[dict[str, str]], **kwargs: Any) -> str:
        ...
