from fastapi import APIRouter

from app.auth.router import router as auth_router
from app.movies.my_reviews import router as my_reviews_router
from app.movies.router import router as movies_router
from app.reports.problems import router as problems_router
from app.reports.router import router as reports_router

api_router = APIRouter()

api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(movies_router, prefix="/movies", tags=["movies"])
api_router.include_router(my_reviews_router, prefix="/reviews", tags=["reviews"])
api_router.include_router(reports_router, prefix="/reports", tags=["reports"])
api_router.include_router(problems_router, prefix="/reports/problems", tags=["problems"])
