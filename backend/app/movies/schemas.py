"""Contratos de cadastro, edição parcial e consulta de filmes."""

from datetime import date
from typing import Annotated

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


class MoviePage(BaseModel):
    items: list[MovieRead]
    total: int
    page: int
    page_size: int
    total_pages: int
