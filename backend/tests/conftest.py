from collections.abc import AsyncIterator, Iterator

import httpx
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.auth.service import create_admin
from app.core.config import get_settings
from app.db.session import enable_sqlite_foreign_keys, get_db
from app.main import create_app


@pytest.fixture
def database_url(tmp_path, monkeypatch) -> Iterator[str]:
    url = f"sqlite+aiosqlite:///{(tmp_path / 'movies.db').as_posix()}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    command.upgrade(Config("alembic.ini"), "head")
    command.check(Config("alembic.ini"))
    yield url
    get_settings.cache_clear()


@pytest.fixture
async def database(database_url):
    engine = create_async_engine(database_url)
    enable_sqlite_foreign_keys(engine)
    sessions = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)
    yield sessions
    await engine.dispose()


@pytest.fixture
async def client(database) -> AsyncIterator[httpx.AsyncClient]:
    app = create_app()

    async def override_db():
        async with database() as session:
            yield session

    app.dependency_overrides[get_db] = override_db
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        async with database() as session:
            await create_admin(
                session, "admin@example.com", "Administrador", "senha-de-teste-segura"
            )
        login = await client.post("/api/v1/auth/login", json={
            "email": "admin@example.com", "password": "senha-de-teste-segura",
        })
        assert login.status_code == 200
        client.headers["X-CSRF-Token"] = client.cookies["rocketlab_csrf"]
        yield client


@pytest.fixture
async def user_client(database) -> AsyncIterator[httpx.AsyncClient]:
    app = create_app()

    async def override_db():
        async with database() as session:
            yield session

    app.dependency_overrides[get_db] = override_db
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as ordinary:
        registered = await ordinary.post("/api/v1/auth/register", json={
            "email": "user@example.com", "display_name": "Leitora",
            "password": "senha-segura-da-leitora",
        })
        assert registered.status_code == 201
        ordinary.headers["X-CSRF-Token"] = ordinary.cookies["rocketlab_csrf"]
        yield ordinary
