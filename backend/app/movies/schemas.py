"""Contratos de cadastro, edição parcial e consulta de filmes."""

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, StringConstraints, field_validator

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
Synopsis = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]
GenreName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
PersonName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
Status = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
Year = Annotated[int, Field(strict=True, ge=1, le=9999)]
Duration = Annotated[int, Field(strict=True, gt=0)]
Genres = Annotated[list[GenreName], Field(min_length=1)]
Directors = Annotated[list[PersonName], Field(min_length=1)]
ImageUrl = Annotated[HttpUrl, Field(max_length=2048)]
CollectionName = Literal["favorites", "watchlist"]


class MovieInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    data_lancamento: date | None = None
    duracao_minutos: Duration | None = None
    status_filme: Status | None = None
    url_poster: ImageUrl | None = None
    url_backdrop: ImageUrl | None = None


class MovieCreate(MovieInput):
    titulo: Title
    ano_lancamento: Year
    sinopse: Synopsis
    generos: Genres
    diretores: Directors


class MovieUpdate(MovieInput):
    titulo: Title | None = None
    ano_lancamento: Year | None = None
    sinopse: Synopsis | None = None
    generos: Genres | None = None
    diretores: Directors | None = None

    @field_validator("titulo", "ano_lancamento", "sinopse", "generos", "diretores")
    @classmethod
    def reject_explicit_null(cls, value: object) -> object:
        # Campos omitidos não passam pelo validador e permanecem inalterados.
        if value is None:
            raise ValueError("Este campo não pode ser nulo quando enviado.")
        return value


class MovieRead(BaseModel):
    sk_movie_id: str
    id_filme: str
    titulo: str
    data_lancamento: date | None
    ano_lancamento: int | None
    duracao_minutos: int | None
    status_filme: str | None
    sinopse: str | None
    url_poster: str | None
    url_backdrop: str | None
    generos: list[str]
    diretores: list[str]
    total_avaliacoes: int = 0
    media_avaliacoes: float | None = Field(default=None, description="Média em estrelas, de 0 a 5.")
    is_favorite: bool = False
    in_watchlist: bool = False


class MoviePage(BaseModel):
    items: list[MovieRead]
    total: int
    page: int
    page_size: int
    total_pages: int


class ReviewCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    nota: float = Field(
        strict=True, ge=1, le=5, allow_inf_nan=False, description="Nota em estrelas."
    )
    comentario: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)
    ]


class ReviewUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
    ] | None = None
    nota: float | None = Field(default=None, strict=True, ge=1, le=5, allow_inf_nan=False)
    comentario: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)
    ] | None = None

    @field_validator("nome", "nota", "comentario")
    @classmethod
    def reject_explicit_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("Este campo não pode ser nulo quando enviado.")
        return value


class ReviewRead(BaseModel):
    sk_movie_review_id: str
    sk_movie_id: str
    nome: str
    nota: float = Field(description="Estrelas de 0 a 5; dados históricos podem ser menores que 1.")
    comentario: str
    created_at: datetime


class ReviewList(BaseModel):
    items: list[ReviewRead]
    total: int
    media_avaliacoes: float | None = Field(description="Média em estrelas; null sem avaliações.")
    page: int
    page_size: int
    total_pages: int
