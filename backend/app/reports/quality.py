"""Diagnóstico de preenchimento, vínculos e possíveis duplicatas do catálogo."""

from datetime import UTC, datetime

from pydantic import BaseModel
from sqlalchemy import Integer, and_, case, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.movies.models import (
    DimMovie,
    DimPerson,
    MovieReview,
    bridge_movie_person,
)


class QualityExample(BaseModel):
    movie_id: str
    title: str
    year: int | None


class QualityCheck(BaseModel):
    key: str
    label: str
    description: str
    count: int
    percentage: float
    examples: list[QualityExample]


class QualityReport(BaseModel):
    generated_at: datetime
    total_movies: int
    total_reviews: int
    checks: list[QualityCheck]


def movie_example(row: tuple[str, str, int | None]) -> QualityExample:
    movie_id, title, year = row
    return QualityExample(movie_id=movie_id, title=title, year=year)


async def sample_movies(
    db: AsyncSession, condition: ColumnElement[bool], limit: int = 5
) -> list[QualityExample]:
    rows = await db.execute(
        select(DimMovie.sk_movie_id, DimMovie.titulo, DimMovie.ano_lancamento)
        .where(condition)
        .order_by(DimMovie.titulo, DimMovie.sk_movie_id)
        .limit(limit)
    )
    return [movie_example(row) for row in rows]


async def count_and_sample_movies(
    db: AsyncSession, condition: ColumnElement[bool]
) -> tuple[int, list[QualityExample]]:
    rows = (
        await db.execute(
            select(
                DimMovie.sk_movie_id,
                DimMovie.titulo,
                DimMovie.ano_lancamento,
                func.count().over().label("total"),
            )
            .where(condition)
            .order_by(DimMovie.titulo, DimMovie.sk_movie_id)
            .limit(5)
        )
    ).all()
    return (rows[0].total if rows else 0, [movie_example(row[:3]) for row in rows])


async def build_report(db: AsyncSession) -> QualityReport:
    missing_title = or_(DimMovie.titulo.is_(None), func.trim(DimMovie.titulo) == "")
    missing_poster = or_(DimMovie.url_poster.is_(None), func.trim(DimMovie.url_poster) == "")
    missing_synopsis = or_(DimMovie.sinopse.is_(None), func.trim(DimMovie.sinopse) == "")
    missing_year = DimMovie.ano_lancamento.is_(None)
    missing_duration = DimMovie.duracao_minutos.is_(None)
    year_mismatch = and_(
        DimMovie.data_lancamento.is_not(None),
        DimMovie.ano_lancamento.is_not(None),
        cast(func.strftime("%Y", DimMovie.data_lancamento), Integer) != DimMovie.ano_lancamento,
    )
    basic_conditions = (
        missing_title,
        missing_poster,
        missing_synopsis,
        missing_year,
        missing_duration,
        year_mismatch,
    )
    totals = (
        await db.execute(
            select(
                func.count(),
                *(func.sum(case((condition, 1), else_=0)) for condition in basic_conditions),
            ).select_from(DimMovie)
        )
    ).one()
    total_movies = totals[0]
    basic_counts = [int(value or 0) for value in totals[1:]]

    director_movies = (
        select(bridge_movie_person.c.sk_movie_id)
        .join(DimPerson, bridge_movie_person.c.sk_person_id == DimPerson.sk_person_id)
        .where(DimPerson.tipo_pessoa == "Diretor")
    )
    actor_movies = (
        select(bridge_movie_person.c.sk_movie_id)
        .join(DimPerson, bridge_movie_person.c.sk_person_id == DimPerson.sk_person_id)
        .where(DimPerson.tipo_pessoa == "Ator")
    )
    missing_genre = ~DimMovie.genres.any()
    missing_director = DimMovie.sk_movie_id.not_in(director_movies)
    missing_cast = DimMovie.sk_movie_id.not_in(actor_movies)
    missing_companies = ~DimMovie.companies.any()
    missing_performance = ~DimMovie.performance.has()
    quoted_synopsis = func.substr(DimMovie.sinopse, 1, 1) == '"'
    no_reviews = ~DimMovie.reviews.any()
    missing_director_count, missing_director_samples = await count_and_sample_movies(
        db, missing_director
    )
    missing_cast_count, missing_cast_samples = await count_and_sample_movies(db, missing_cast)
    prepared_samples = {
        "missing_director": missing_director_samples,
        "missing_cast": missing_cast_samples,
    }

    normalized_title = func.lower(func.trim(DimMovie.titulo))
    duplicate_groups = (
        select(
            normalized_title.label("title"),
            DimMovie.ano_lancamento.label("year"),
            func.count().label("size"),
        )
        .group_by(normalized_title, DimMovie.ano_lancamento)
        .having(func.count() > 1)
        .subquery()
    )
    duplicate_count = await db.scalar(select(func.coalesce(func.sum(duplicate_groups.c.size), 0)))

    definitions = [
        (
            "missing_title",
            "Título ausente",
            "Filmes sem título preenchido.",
            basic_counts[0],
            missing_title,
        ),
        (
            "missing_poster",
            "Pôster ausente",
            "Filmes sem URL de pôster.",
            basic_counts[1],
            missing_poster,
        ),
        (
            "missing_synopsis",
            "Sinopse ausente",
            "Filmes sem sinopse preenchida.",
            basic_counts[2],
            missing_synopsis,
        ),
        (
            "missing_year",
            "Ano ausente",
            "Filmes sem ano de lançamento.",
            basic_counts[3],
            missing_year,
        ),
        (
            "missing_duration",
            "Duração ausente",
            "Filmes sem duração informada.",
            basic_counts[4],
            missing_duration,
        ),
        (
            "year_mismatch",
            "Ano divergente",
            "O ano informado difere do ano da data de lançamento.",
            basic_counts[5],
            year_mismatch,
        ),
        (
            "missing_genre",
            "Sem gênero",
            "Filmes sem vínculo com um gênero.",
            await db.scalar(select(func.count()).select_from(DimMovie).where(missing_genre)) or 0,
            missing_genre,
        ),
        (
            "missing_director",
            "Sem direção",
            "Filmes sem pessoa vinculada como diretor.",
            missing_director_count,
            missing_director,
        ),
        (
            "missing_cast",
            "Sem elenco",
            "Cobertura dos vínculos de atores na base fornecida.",
            missing_cast_count,
            missing_cast,
        ),
        (
            "missing_companies",
            "Sem produtora",
            "Filmes sem vínculo com uma produtora na base fornecida.",
            await db.scalar(select(func.count()).select_from(DimMovie).where(missing_companies))
            or 0,
            missing_companies,
        ),
        (
            "missing_performance",
            "Sem indicadores",
            "Filmes sem registro de popularidade ou desempenho na base fornecida.",
            await db.scalar(select(func.count()).select_from(DimMovie).where(missing_performance))
            or 0,
            missing_performance,
        ),
        (
            "quoted_synopsis",
            "Sinopse com aspas suspeitas",
            "Texto iniciado por aspas que não pôde ser corrigido automaticamente com segurança.",
            await db.scalar(select(func.count()).select_from(DimMovie).where(quoted_synopsis)) or 0,
            quoted_synopsis,
        ),
        (
            "no_reviews",
            "Sem avaliações",
            "Cobertura de avaliações; não indica erro nos dados do filme.",
            await db.scalar(select(func.count()).select_from(DimMovie).where(no_reviews)) or 0,
            no_reviews,
        ),
    ]

    checks = []
    for key, label, description, count, condition in definitions:
        checks.append(
            QualityCheck(
                key=key,
                label=label,
                description=description,
                count=count,
                percentage=round(count * 100 / total_movies, 3) if total_movies else 0,
                examples=(
                    prepared_samples[key]
                    if key in prepared_samples
                    else await sample_movies(db, condition)
                    if count
                    else []
                ),
            )
        )

    duplicates = []
    if duplicate_count:
        groups = (
            await db.execute(
                select(duplicate_groups.c.title, duplicate_groups.c.year)
                .order_by(duplicate_groups.c.title, duplicate_groups.c.year)
                .limit(3)
            )
        ).all()
        group_conditions = [
            and_(
                normalized_title == title,
                DimMovie.ano_lancamento == year
                if year is not None
                else DimMovie.ano_lancamento.is_(None),
            )
            for title, year in groups
        ]
        rows = await db.execute(
            select(DimMovie.sk_movie_id, DimMovie.titulo, DimMovie.ano_lancamento)
            .where(or_(*group_conditions))
            .order_by(DimMovie.titulo, DimMovie.sk_movie_id)
            .limit(5)
        )
        duplicates = [movie_example(row) for row in rows]
    checks.append(
        QualityCheck(
            key="possible_duplicates",
            label="Possíveis duplicatas",
            description="Mesmo título e ano; versões distintas também podem aparecer aqui.",
            count=duplicate_count or 0,
            percentage=round((duplicate_count or 0) * 100 / total_movies, 3) if total_movies else 0,
            examples=duplicates,
        )
    )
    total_reviews = await db.scalar(select(func.count()).select_from(MovieReview)) or 0
    return QualityReport(
        generated_at=datetime.now(UTC),
        total_movies=total_movies,
        total_reviews=total_reviews,
        checks=checks,
    )
