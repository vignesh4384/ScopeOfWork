import config
from pathlib import Path
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

# Ensure SQLite directory exists (only needed for SQLite)
url = make_url(config.settings.database_url)
if url.drivername.startswith("sqlite"):
    db_path = url.database
    if db_path and not db_path.startswith(":"):
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

engine = create_async_engine(config.settings.database_url, echo=False, future=True, pool_pre_ping=True)
async_session = sessionmaker(
    engine, expire_on_commit=False, class_=AsyncSession, autoflush=False, autocommit=False
)


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)


async def get_session():
    async with async_session() as session:
        yield session
