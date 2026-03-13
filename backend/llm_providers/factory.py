from .anthropic_claude import AnthropicLLMProvider
from .azure_openai import AzureOpenAILLMProvider
from ..config import settings


def get_provider():
    if settings.provider_preference.lower() == "anthropic" and settings.anthropic_api_key:
        return AnthropicLLMProvider()
    if settings.azure_openai_key:
        return AzureOpenAILLMProvider()
    # default to anthropic provider even if missing to allow fallbacks
    return AnthropicLLMProvider()
