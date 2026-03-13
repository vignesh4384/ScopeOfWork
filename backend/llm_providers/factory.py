from llm_providers.anthropic_claude import AnthropicLLMProvider
from llm_providers.azure_openai import AzureOpenAILLMProvider
import config


def get_provider():
    if config.settings.provider_preference.lower() == "anthropic" and config.settings.anthropic_api_key:
        return AnthropicLLMProvider()
    if config.settings.azure_openai_key:
        return AzureOpenAILLMProvider()
    # default to anthropic provider even if missing to allow fallbacks
    return AnthropicLLMProvider()
