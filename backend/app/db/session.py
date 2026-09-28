from collections.abc import AsyncIterator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings
from app.movies.search import normalize_search

settings = get_settings()


def enable_sqlite_foreign_keys(async_engine: AsyncEngine) -> None:
    """Habilita chaves estrangeiras em cada conexão SQLite."""

    @event.listens_for(async_engine.sync_engine, "connect")
    def _set_sqlite_pragma(dbapi_connection: object, connection_record: object) -> None:
        del connection_record
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        # Grandes conjuntos intermediários da busca não precisam de arquivos temporários.
        cursor.execute("PRAGMA temp_store=MEMORY")
        cursor.close()
        dbapi_connection.create_function(
            "search_normalize", 1, normalize_search, deterministic=True
        )


engine = create_async_engine(settings.database_url, echo=settings.sql_echo)
enable_sqlite_foreign_keys(engine)
AsyncSessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    """Fornece uma sessão assíncrona por requisição."""

    async with AsyncSessionLocal() as session:
        yield session
