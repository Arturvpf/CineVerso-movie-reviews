"""Persistência das listas pessoais de filmes."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.movies.models import MovieCollection
from app.movies.schemas import CollectionName


async def flags_for_movies(
    db: AsyncSession, movie_ids: list[str], user_id: str | None
) -> dict[str, set[str]]:
    if not movie_ids or user_id is None:
        return {}
    rows = await db.execute(
        select(MovieCollection.sk_movie_id, MovieCollection.collection).where(
            MovieCollection.sk_movie_id.in_(movie_ids), MovieCollection.user_id == user_id
        )
    )
    flags: dict[str, set[str]] = {}
    for movie_id, collection in rows:
        flags.setdefault(movie_id, set()).add(collection)
    return flags


async def add(db: AsyncSession, movie_id: str, collection: CollectionName, user_id: str) -> None:
    entry = await db.scalar(select(MovieCollection).where(
        MovieCollection.sk_movie_id == movie_id,
        MovieCollection.collection == collection,
        MovieCollection.user_id == user_id,
    ))
    if entry is None:
        db.add(MovieCollection(sk_movie_id=movie_id, collection=collection, user_id=user_id))
        await db.commit()


async def remove(db: AsyncSession, movie_id: str, collection: CollectionName, user_id: str) -> None:
    entry = await db.scalar(select(MovieCollection).where(
        MovieCollection.sk_movie_id == movie_id,
        MovieCollection.collection == collection,
        MovieCollection.user_id == user_id,
    ))
    if entry is not None:
        await db.delete(entry)
        await db.commit()
