"""Relatos de problemas enviados pelos usuários ao administrador."""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ProblemReport(Base):
    __tablename__ = "problem_reports"
    __table_args__ = (
        CheckConstraint("category IN ('site', 'movie', 'other')", name="problem_category_valid"),
        CheckConstraint("status IN ('open', 'resolved')", name="problem_status_valid"),
        Index("ix_problem_reports_user_created", "user_id", "created_at"),
        Index("ix_problem_reports_status_created", "status", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id", ondelete="CASCADE"))
    movie_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("dim_movies.sk_movie_id", ondelete="SET NULL"), default=None
    )
    category: Mapped[str] = mapped_column(String(10))
    subject: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(String(4000))
    status: Mapped[str] = mapped_column(String(10), default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
