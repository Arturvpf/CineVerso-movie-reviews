from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.reports.quality import QualityReport, build_report

router = APIRouter()


@router.get("/data-quality", response_model=QualityReport)
async def data_quality_report(db: AsyncSession = Depends(get_db)) -> QualityReport:
    return await build_report(db)
