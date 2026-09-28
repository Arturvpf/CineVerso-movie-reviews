from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_admin
from app.auth.models import User
from app.db.session import get_db
from app.reports.quality import QualityReport, build_report

router = APIRouter()


@router.get("/data-quality", response_model=QualityReport)
async def data_quality_report(
    db: AsyncSession = Depends(get_db), admin: User = Depends(get_admin)
) -> QualityReport:
    return await build_report(db)
