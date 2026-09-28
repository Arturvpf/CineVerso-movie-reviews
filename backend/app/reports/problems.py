"""Envio, acompanhamento e triagem dos relatos de problemas."""

from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_admin, get_current_user
from app.auth.models import User
from app.auth.service import utc_now
from app.db.session import get_db
from app.movies.models import DimMovie
from app.reports.models import ProblemReport
from app.reports.schemas import (
    ProblemCreate,
    ProblemPage,
    ProblemRead,
    ProblemStatus,
    ProblemStatusUpdate,
)

router = APIRouter()


def serialize_problem(
    report: ProblemReport, reporter_name: str, reporter_email: str,
    movie_title: str | None,
) -> ProblemRead:
    return ProblemRead(
        id=report.id, user_id=report.user_id,
        reporter_name=reporter_name, reporter_email=reporter_email,
        movie_id=report.movie_id, movie_title=movie_title,
        category=report.category, subject=report.subject,
        description=report.description, status=report.status,
        created_at=report.created_at, resolved_at=report.resolved_at,
    )


async def get_problem(db: AsyncSession, report_id: str) -> ProblemRead | None:
    row = (await db.execute(
        select(ProblemReport, User.display_name, User.email, DimMovie.titulo)
        .join(User, User.id == ProblemReport.user_id)
        .outerjoin(DimMovie, DimMovie.sk_movie_id == ProblemReport.movie_id)
        .where(ProblemReport.id == report_id)
    )).one_or_none()
    return serialize_problem(*row) if row else None


async def list_problems(
    db: AsyncSession, page: int, page_size: int,
    user_id: str | None = None, problem_status: ProblemStatus | None = None,
) -> ProblemPage:
    conditions = []
    if user_id is not None:
        conditions.append(ProblemReport.user_id == user_id)
    if problem_status is not None:
        conditions.append(ProblemReport.status == problem_status)
    total = await db.scalar(select(func.count()).select_from(ProblemReport).where(*conditions)) or 0
    rows = (await db.execute(
        select(ProblemReport, User.display_name, User.email, DimMovie.titulo)
        .join(User, User.id == ProblemReport.user_id)
        .outerjoin(DimMovie, DimMovie.sk_movie_id == ProblemReport.movie_id)
        .where(*conditions)
        .order_by(ProblemReport.created_at.desc(), ProblemReport.id.desc())
        .offset((page - 1) * page_size).limit(page_size)
    )).all()
    return ProblemPage(
        items=[serialize_problem(*row) for row in rows], total=total,
        page=page, page_size=page_size, total_pages=(total + page_size - 1) // page_size,
    )


@router.post("", response_model=ProblemRead, status_code=status.HTTP_201_CREATED)
async def create_problem(
    payload: ProblemCreate, db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProblemRead:
    movie_title = None
    if payload.movie_id:
        movie_title = await db.scalar(
            select(DimMovie.titulo).where(DimMovie.sk_movie_id == payload.movie_id)
        )
        if movie_title is None:
            raise HTTPException(status_code=404, detail="Filme não encontrado.")
    report = ProblemReport(
        id=uuid4().hex, user_id=user.id, movie_id=payload.movie_id,
        category=payload.category, subject=payload.subject,
        description=payload.description, status="open",
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return serialize_problem(report, user.display_name, user.email, movie_title)


@router.get("/mine", response_model=ProblemPage)
async def my_problems(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProblemPage:
    return await list_problems(db, page, page_size, user_id=user.id)


@router.get("/inbox", response_model=ProblemPage)
async def inbox(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
    problem_status: ProblemStatus | None = Query(default=None, alias="status"),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin),
) -> ProblemPage:
    return await list_problems(db, page, page_size, problem_status=problem_status)


@router.patch("/{report_id}", response_model=ProblemRead)
async def update_problem(
    report_id: str, payload: ProblemStatusUpdate,
    db: AsyncSession = Depends(get_db), admin: User = Depends(get_admin),
) -> ProblemRead:
    report = await db.get(ProblemReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Relato não encontrado.")
    report.status = payload.status
    report.resolved_at = utc_now() if payload.status == "resolved" else None
    await db.commit()
    return await get_problem(db, report_id)
