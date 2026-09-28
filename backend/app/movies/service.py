"""Persistência dos filmes e de seus vínculos com gêneros e diretores."""

from uuid import uuid4

from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.movies import collections, reviews
from app.movies.models import (
    DimGenre,
    DimMovie,
    DimPerson,
    FactMoviePerformance,
    MovieCollection,
    MovieReview,
    bridge_movie_person,
)
from app.movies.schemas import CollectionName, MovieCreate, MoviePage, MovieRead, MovieUpdate


async def list_movies(
    db: AsyncSession, page: int, page_size: int, q: str | None,
    collection: CollectionName | None = None,
    genre: str | None = None,
    min_rating: float | None = None,
    user_id: str | None = None,
) -> MoviePage:
    statement = select(DimMovie)
    count_statement = select(func.count()).select_from(DimMovie)
    if collection:
        statement = statement.join(MovieCollection).where(
            MovieCollection.collection == collection, MovieCollection.user_id == user_id
        )
        count_statement = count_statement.join(MovieCollection).where(
            MovieCollection.collection == collection, MovieCollection.user_id == user_id
        )
    search = (q or "").strip()
    if search:
        # Escapa % e _ para que o texto informado seja buscado literalmente.
        matching_directors = (
            select(bridge_movie_person.c.sk_movie_id)
            .join(DimPerson, bridge_movie_person.c.sk_person_id == DimPerson.sk_person_id)
            .where(
                DimPerson.tipo_pessoa == "Diretor",
                DimPerson.nome_pessoa.icontains(search, autoescape=True),
            )
        )
        condition = or_(
            DimMovie.titulo.icontains(search, autoescape=True),
            DimMovie.sk_movie_id.in_(matching_directors),
        )
        statement = statement.where(condition)
        count_statement = count_statement.where(condition)
        relevance = case(
            (func.lower(DimMovie.titulo) == search.lower(), 0),
            (DimMovie.titulo.istartswith(search, autoescape=True), 1),
            (DimMovie.titulo.icontains(search, autoescape=True), 2),
            else_=3,
        )
        statement = statement.order_by(relevance)

    selected_genre = (genre or "").strip()
    if selected_genre:
        condition = DimMovie.genres.any(DimGenre.nome_genero == selected_genre)
        statement = statement.where(condition)
        count_statement = count_statement.where(condition)

    if min_rating is not None:
        # As avaliações são armazenadas de 0 a 10 e exibidas de 0 a 5 estrelas.
        rated_movies = (
            select(MovieReview.sk_movie_id)
            .group_by(MovieReview.sk_movie_id)
            .having(func.avg(MovieReview.nota) >= min_rating * 2)
        )
        condition = DimMovie.sk_movie_id.in_(rated_movies)
        statement = statement.where(condition)
        count_statement = count_statement.where(condition)

    total = await db.scalar(count_statement) or 0
    # O ID desempata títulos iguais, mantendo a ordem entre páginas.
    statement = (
        statement.order_by(DimMovie.titulo, DimMovie.sk_movie_id)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .options(selectinload(DimMovie.genres), selectinload(DimMovie.people))
    )
    movies = (await db.scalars(statement)).all()
    movie_ids = [movie.sk_movie_id for movie in movies]
    summaries = await reviews.get_summaries(db, movie_ids)
    flags = await collections.flags_for_movies(db, movie_ids, user_id)
    return MoviePage(
        items=[
            serialize_movie(
                movie, *summaries.get(movie.sk_movie_id, (0, None)),
                flags.get(movie.sk_movie_id, set()),
            ) for movie in movies
        ],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
    )


async def list_genres(db: AsyncSession) -> list[str]:
    statement = (
        select(DimGenre.nome_genero)
        .join(DimGenre.movies)
        .distinct()
        .order_by(DimGenre.nome_genero)
    )
    return (await db.scalars(statement)).all()


async def list_trending(db: AsyncSession, sort: str, user_id: str | None) -> MoviePage:
    """Ranking editorial calculado sobre popularidade e avaliações disponíveis."""
    if sort == "popular":
        ranked = (
            select(FactMoviePerformance.sk_movie_id)
            .where(FactMoviePerformance.popularidade.is_not(None))
            .order_by(FactMoviePerformance.popularidade.desc(), FactMoviePerformance.sk_movie_id)
            .limit(24)
        )
    else:
        count = func.count(MovieReview.sk_movie_review_id)
        ranked = select(MovieReview.sk_movie_id).group_by(MovieReview.sk_movie_id)
        if sort == "top_rated":
            ranked = ranked.having(count >= 5).order_by(
                func.avg(MovieReview.nota).desc(), count.desc(), MovieReview.sk_movie_id
            )
        else:
            ranked = ranked.order_by(count.desc(), MovieReview.sk_movie_id)
        ranked = ranked.limit(24)
    ids = (await db.scalars(ranked)).all()
    if not ids:
        return MoviePage(items=[], total=0, page=1, page_size=24, total_pages=0)
    movies = (await db.scalars(
        select(DimMovie).where(DimMovie.sk_movie_id.in_(ids))
        .options(selectinload(DimMovie.genres), selectinload(DimMovie.people))
    )).all()
    by_id = {movie.sk_movie_id: movie for movie in movies}
    summaries = await reviews.get_summaries(db, ids)
    flags = await collections.flags_for_movies(db, ids, user_id)
    return MoviePage(
        items=[serialize_movie(
            by_id[movie_id], *summaries.get(movie_id, (0, None)), flags.get(movie_id, set())
        ) for movie_id in ids if movie_id in by_id],
        total=len(ids), page=1, page_size=24, total_pages=1,
    )


async def get_movie(db: AsyncSession, movie_id: str) -> DimMovie | None:
    statement = (
        select(DimMovie)
        .where(DimMovie.sk_movie_id == movie_id)
        .options(selectinload(DimMovie.genres), selectinload(DimMovie.people))
        .execution_options(populate_existing=True)
    )
    return await db.scalar(statement)


async def delete_movie(db: AsyncSession, movie: DimMovie) -> None:
    # Os relacionamentos existentes removem dependências sem apagar dimensões compartilhadas.
    await db.delete(movie)
    await db.commit()


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


async def movie_response(
    db: AsyncSession, movie: DimMovie, user_id: str | None = None
) -> MovieRead:
    summaries = await reviews.get_summaries(db, [movie.sk_movie_id])
    flags = await collections.flags_for_movies(db, [movie.sk_movie_id], user_id)
    return serialize_movie(
        movie, *summaries.get(movie.sk_movie_id, (0, None)),
        flags.get(movie.sk_movie_id, set()),
    )


def serialize_movie(
    movie: DimMovie, total_avaliacoes: int = 0, media_avaliacoes: float | None = None,
    collection_flags: set[str] | None = None,
) -> MovieRead:
    collection_flags = collection_flags or set()
    return MovieRead(
        **{
            field: getattr(movie, field)
            for field in MovieRead.model_fields
            if field not in {
                "generos", "diretores", "total_avaliacoes", "media_avaliacoes",
                "is_favorite", "in_watchlist",
            }
        },
        generos=sorted(genre.nome_genero for genre in movie.genres),
        diretores=sorted(
            person.nome_pessoa for person in movie.people if person.tipo_pessoa == "Diretor"
        ),
        total_avaliacoes=total_avaliacoes,
        media_avaliacoes=media_avaliacoes,
        is_favorite="favorites" in collection_flags,
        in_watchlist="watchlist" in collection_flags,
    )
