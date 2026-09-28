"""Servidor exclusivo dos testes de navegador, sempre com banco temporário."""

import asyncio
import os
from pathlib import Path
from tempfile import TemporaryDirectory

from alembic import command
from alembic.config import Config


def main() -> None:
    with TemporaryDirectory(prefix="cineverso-e2e-") as directory:
        os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{Path(directory).as_posix()}/test.db"
        os.environ["ENVIRONMENT"] = "local"
        os.environ["BACKEND_CORS_ORIGINS"] = '["http://localhost:5174"]'
        from app.auth.service import create_admin
        from app.core.config import get_settings
        from app.db.session import AsyncSessionLocal, engine

        get_settings.cache_clear()
        command.upgrade(Config("alembic.ini"), "head")

        async def seed() -> None:
            async with AsyncSessionLocal() as db:
                await create_admin(db, "admin@example.com", "Admin E2E", "test-password-12345")
            await engine.dispose()

        asyncio.run(seed())
        import uvicorn

        uvicorn.run("app.main:app", host="127.0.0.1", port=8011, log_level="warning")


if __name__ == "__main__":
    main()
