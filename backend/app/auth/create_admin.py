"""Cria um administrador sem colocar a senha no histórico do terminal."""

import asyncio
from getpass import getpass

from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError

from app.auth.schemas import RegisterInput
from app.auth.service import create_admin
from app.db.session import AsyncSessionLocal, engine


async def save_admin(payload: RegisterInput) -> None:
    try:
        async with AsyncSessionLocal() as db:
            try:
                user, adopted = await create_admin(
                    db, str(payload.email), payload.display_name, payload.password
                )
            except IntegrityError as exc:
                await db.rollback()
                raise ValueError("Já existe uma conta com esse email.") from exc
        print(f"Administrador {user.email} criado. Listas antigas atribuídas: {adopted}.")
    finally:
        await engine.dispose()


def main() -> None:
    email = input("Email do administrador: ").strip()
    display_name = input("Nome exibido: ").strip()
    password = getpass("Senha (mínimo 12 caracteres): ")
    if password != getpass("Confirme a senha: "):
        raise SystemExit("As senhas não coincidem.")
    try:
        payload = RegisterInput(email=email, display_name=display_name, password=password)
    except ValidationError as exc:
        raise SystemExit(f"Dados inválidos: {exc.errors()[0]['msg']}") from exc
    try:
        asyncio.run(save_admin(payload))
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc


if __name__ == "__main__":
    main()
