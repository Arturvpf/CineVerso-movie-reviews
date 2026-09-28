from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.movies import collections, reviews, service
from app.movies.models import DimMovie
from app.movies.schemas import (
    CollectionName,
    MovieCreate,
    MoviePage,
    MovieRead,
    MovieUpdate,
    ReviewCreate,
    ReviewList,
    ReviewRead,
)

router = APIRouter()


@router.get("", response_model=MoviePage)
async def list_movies(
    page: int = Query(default=1, ge=1, description="Número da página, começando em 1."),
    page_size: int = Query(default=20, ge=1, le=100, description="Filmes por página."),
    q: str | None = Query(default=None, max_length=500, description="Trecho do título do filme."),
    collection: CollectionName | None = Query(default=None, description="Lista de filmes."),
    genre: str | None = Query(default=None, max_length=50, description="Gênero exato."),
    min_rating: float | None = Query(
        default=None, ge=0, le=5, description="Média mínima em estrelas; sem notas não entram."
    ),
    db: AsyncSession = Depends(get_db),
) -> MoviePage:
    return await service.list_movies(db, page, page_size, q, collection, genre, min_rating)


@router.get("/genres", response_model=list[str])
async def list_genres(db: AsyncSession = Depends(get_db)) -> list[str]:
    return await service.list_genres(db)


async def find_movie(movie_id: str, db: AsyncSession) -> DimMovie:
    movie = await service.get_movie(db, movie_id)
    if movie is None:
        raise HTTPException(status_code=404, detail="Filme não encontrado.")
    return movie


async def persist_movie(
    db: AsyncSession, payload: MovieCreate | MovieUpdate, movie: DimMovie | None = None
) -> MovieRead:
    try:
        saved = await service.save_movie(db, payload, movie)
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Conflito ao salvar o filme. Consulte os dados e tente novamente.",
        ) from exc
    return await service.movie_response(db, saved)


@router.post("", response_model=MovieRead, status_code=status.HTTP_201_CREATED)
async def create_movie(payload: MovieCreate, db: AsyncSession = Depends(get_db)) -> MovieRead:
    return await persist_movie(db, payload)


@router.get("/{movie_id}", response_model=MovieRead)
async def read_movie(movie_id: str, db: AsyncSession = Depends(get_db)) -> MovieRead:
    return await service.movie_response(db, await find_movie(movie_id, db))


@router.patch("/{movie_id}", response_model=MovieRead)
async def update_movie(
    movie_id: str, payload: MovieUpdate, db: AsyncSession = Depends(get_db)
) -> MovieRead:
    movie = await find_movie(movie_id, db)
    return await persist_movie(db, payload, movie)


@router.delete("/{movie_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_movie(movie_id: str, db: AsyncSession = Depends(get_db)) -> Response:
    movie = await find_movie(movie_id, db)
    try:
        await service.delete_movie(db, movie)
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Conflito ao excluir o filme. Consulte os dados e tente novamente.",
        ) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/{movie_id}/collections/{collection}", response_model=MovieRead)
async def add_to_collection(
    movie_id: str, collection: CollectionName, db: AsyncSession = Depends(get_db)
) -> MovieRead:
    await find_movie(movie_id, db)
    try:
        await collections.add(db, movie_id, collection)
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Conflito ao salvar a lista.") from exc
    return await service.movie_response(db, await find_movie(movie_id, db))


@router.delete("/{movie_id}/collections/{collection}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_from_collection(
    movie_id: str, collection: CollectionName, db: AsyncSession = Depends(get_db)
) -> Response:
    await find_movie(movie_id, db)
    await collections.remove(db, movie_id, collection)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{movie_id}/reviews", response_model=ReviewRead, status_code=status.HTTP_201_CREATED)
async def create_review(
    movie_id: str, payload: ReviewCreate, db: AsyncSession = Depends(get_db)
) -> ReviewRead:
    await find_movie(movie_id, db)
    try:
        return await reviews.create_review(db, movie_id, payload)
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Conflito ao salvar a avaliação.") from exc


@router.get("/{movie_id}/reviews", response_model=ReviewList)
async def list_reviews(movie_id: str, db: AsyncSession = Depends(get_db)) -> ReviewList:
    await find_movie(movie_id, db)
    return await reviews.list_reviews(db, movie_id)
