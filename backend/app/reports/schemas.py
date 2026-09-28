"""Contratos para relatos de problemas."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, StringConstraints

Category = Literal["site", "movie", "other"]
ProblemStatus = Literal["open", "resolved"]


class ProblemCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: Category
    subject: Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=160)]
    description: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=10, max_length=4000)
    ]
    movie_id: Annotated[str, StringConstraints(min_length=1, max_length=64)] | None = None


class ProblemStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: ProblemStatus


class ProblemRead(BaseModel):
    id: str
    user_id: str
    reporter_name: str
    reporter_email: str
    movie_id: str | None
    movie_title: str | None
    category: Category
    subject: str
    description: str
    status: ProblemStatus
    created_at: datetime
    resolved_at: datetime | None


class ProblemPage(BaseModel):
    items: list[ProblemRead]
    total: int
    page: int
    page_size: int
    total_pages: int
