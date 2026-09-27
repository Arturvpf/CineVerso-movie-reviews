"""Persistência dos filmes e de seus vínculos com gêneros e diretores."""

from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.movies.models import DimGenre, DimMovie, DimPerson
from app.movies.schemas import MovieCreate, MovieRead, MovieUpdate


async def get_movie(db: AsyncSession, movie_id: str) -> DimMovie | None:
    statement = (
        select(DimMovie)
        .where(DimMovie.sk_movie_id == movie_id)
        .options(selectinload(DimMovie.genres), selectinload(DimMovie.people))
        .execution_options(populate_existing=True)
    )
    return await db.scalar(statement)


async def resolve_genres(db: AsyncSession, names: list[str]) -> list[DimGenre]:
    genres = []
    for name in dict.fromkeys(names):
        genre = await db.scalar(select(DimGenre).where(DimGenre.nome_genero == name))
        if genre is None:
            genre = DimGenre(nome_genero=name)
            db.add(genre)
        genres.append(genre)
    return genres


async def resolve_directors(db: AsyncSession, names: list[str]) -> list[DimPerson]:
    directors = []
    for name in dict.fromkeys(names):
        director = await db.scalar(
            select(DimPerson).where(
                DimPerson.nome_pessoa == name, DimPerson.tipo_pessoa == "Diretor"
            )
        )
        if director is None:
            director = DimPerson(nome_pessoa=name, tipo_pessoa="Diretor")
            db.add(director)
        directors.append(director)
    return directors


async def save_movie(
    db: AsyncSession, payload: MovieCreate | MovieUpdate, movie: DimMovie | None = None
) -> DimMovie:
    values = payload.model_dump(exclude_unset=True)
    genres = values.pop("generos", None)
    directors = values.pop("diretores", None)
    for field in ("url_poster", "url_backdrop"):
        if values.get(field) is not None:
            values[field] = str(values[field])

    if movie is None:
        movie = DimMovie(id_filme=str(uuid4()), genres=[], people=[])
        db.add(movie)

    for field, value in values.items():
        setattr(movie, field, value)
    if genres is not None:
        movie.genres = await resolve_genres(db, genres)
    if directors is not None:
        # A edição da direção preserva atores e roteiristas já vinculados.
        other_people = [person for person in movie.people if person.tipo_pessoa != "Diretor"]
        movie.people = other_people + await resolve_directors(db, directors)

    await db.commit()
    return movie


def serialize_movie(movie: DimMovie) -> MovieRead:
    return MovieRead(
        **{
            field: getattr(movie, field)
            for field in MovieRead.model_fields
            if field not in {"generos", "diretores"}
        },
        generos=sorted(genre.nome_genero for genre in movie.genres),
        diretores=sorted(
            person.nome_pessoa for person in movie.people if person.tipo_pessoa == "Diretor"
        ),
    )
