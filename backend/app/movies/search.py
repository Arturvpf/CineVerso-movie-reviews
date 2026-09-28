"""Normalização compartilhada pela busca SQLite, sem alterar os dados exibidos."""

import unicodedata


def normalize_search(value: str | None) -> str:
    return "".join(
        character for character in unicodedata.normalize("NFKD", (value or "").casefold())
        if not unicodedata.combining(character)
    )
