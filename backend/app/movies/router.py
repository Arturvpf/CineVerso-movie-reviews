from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.movies import service
from app.movies.models import DimMovie
from app.movies.schemas import MovieCreate, MoviePage, MovieRead, MovieUpdate

router = APIRouter()


@router.get("", response_model=MoviePage)
async def list_movies(
    page: int = Query(default=1, ge=1, description="Número da página, começando em 1."),
    page_size: int = Query(default=20, ge=1, le=100, description="Filmes por página."),
    q: str | None = Query(default=None, max_length=500, description="Trecho do título do filme."),
    db: AsyncSession = Depends(get_db),
) -> MoviePage:
    return await service.list_movies(db, page, page_size, q)


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
    return service.serialize_movie(saved)


@router.post("", response_model=MovieRead, status_code=status.HTTP_201_CREATED)
async def create_movie(payload: MovieCreate, db: AsyncSession = Depends(get_db)) -> MovieRead:
    return await persist_movie(db, payload)


@router.get("/{movie_id}", response_model=MovieRead)
async def read_movie(movie_id: str, db: AsyncSession = Depends(get_db)) -> MovieRead:
    return service.serialize_movie(await find_movie(movie_id, db))


@router.patch("/{movie_id}", response_model=MovieRead)
async def update_movie(
    movie_id: str, payload: MovieUpdate, db: AsyncSession = Depends(get_db)
) -> MovieRead:
    movie = await find_movie(movie_id, db)
    return await persist_movie(db, payload, movie)
