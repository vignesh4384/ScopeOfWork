from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    azure_openai_endpoint: str = ""
    azure_openai_key: str = ""
    azure_openai_deployment: str = "gpt-4o"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-3-sonnet-20240229"
    provider_preference: str = "anthropic"  # options: anthropic|azure
    # Database — Azure SQL (free tier) or SQLite fallback
    database_url: str = "sqlite+aiosqlite:///data/app.db"
    allow_origins: str = "http://localhost:5173,https://calm-island-08c473e0f.4.azurestaticapps.net"

    class Config:
        env_file = Path(__file__).resolve().parent / ".env"


settings = Settings()
