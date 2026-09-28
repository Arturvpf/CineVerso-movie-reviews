"""Persistência das listas de filmes do administrador atual."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.movies.models import MovieCollection
from app.movies.schemas import CollectionName


async def flags_for_movies(db: AsyncSession, movie_ids: list[str]) -> dict[str, set[str]]:
    if not movie_ids:
        return {}
    rows = await db.execute(
        select(MovieCollection.sk_movie_id, MovieCollection.collection).where(
            MovieCollection.sk_movie_id.in_(movie_ids)
        )
    )
    flags: dict[str, set[str]] = {}
    for movie_id, collection in rows:
        flags.setdefault(movie_id, set()).add(collection)
    return flags


async def add(db: AsyncSession, movie_id: str, collection: CollectionName) -> None:
    key = (movie_id, collection)
    if await db.get(MovieCollection, key) is None:
        db.add(MovieCollection(sk_movie_id=movie_id, collection=collection))
        await db.commit()


async def remove(db: AsyncSession, movie_id: str, collection: CollectionName) -> None:
    entry = await db.get(MovieCollection, (movie_id, collection))
    if entry is not None:
        await db.delete(entry)
        await db.commit()
