from pathlib import Path
from dotenv import load_dotenv

# Force-load .env with override so system env vars (even if empty) don't shadow file values
load_dotenv(Path(__file__).resolve().parent / ".env", override=True)

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    azure_openai_endpoint: str = ""
    azure_openai_key: str = ""
    azure_openai_deployment: str = "gpt-4o"
    azure_openai_mini_deployment: str = ""
    azure_openai_embedding_deployment: str = "text-embedding-ada-002"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-3-sonnet-20240229"
    provider_preference: str = "anthropic"  # options: anthropic|azure
    # Database — Azure SQL (free tier) or SQLite fallback
    database_url: str = "sqlite+aiosqlite:///data/app.db"
    allow_origins: str = "http://localhost:5173,http://localhost:5174,https://calm-island-08c473e0f.4.azurestaticapps.net"

    class Config:
        env_file = Path(__file__).resolve().parent / ".env"


settings = Settings()
