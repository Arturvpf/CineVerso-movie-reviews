import csv
from zipfile import ZipFile

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.exc import IntegrityError

from app.core.config import get_settings
from app.db.base import Base
from app.import_csv import FILES, import_sources


@pytest.fixture
def engine(tmp_path):
    engine = create_engine(f"sqlite:///{(tmp_path / 'test.db').as_posix()}")
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def sources(tmp_path):
    folder = tmp_path / "csvs"
    folder.mkdir()
    data = {
        "dim_companies": {"sk_company_id": "company", "nome_produtora": "Estúdio"},
        "dim_genres": {"sk_genre_id": "genre", "nome_genero": "Drama"},
        "dim_movies": {
            "sk_movie_id": "movie",
            "id_filme": "1",
            "titulo": "Filme",
            "ano_lancamento": "2020.0",
            "data_lancamento": "2020-01-01",
            "duracao_minutos": "0",
        },
        "dim_people": {
            "sk_person_id": "person",
            "nome_pessoa": "Diretor",
            "tipo_pessoa": "Diretor",
        },
        "dim_reviews": {
            "sk_review_id": "summary",
            "sk_movie_id": "movie",
            "qtd_avaliacoes_usuarios": "1",
            "nota_media_usuarios": "9.8",
        },
        "fact_movies_performance": {
            "sk_movie_id": "movie",
            "lucro_usd": "0.00",
            "lucro_brl": "0.00",
            "qtd_tmdb": "12.0",
        },
        "bridge_movie_company": {"sk_movie_id": "movie", "sk_company_id": "company"},
        "bridge_movie_genre": {"sk_movie_id": "movie", "sk_genre_id": "genre"},
        "bridge_movie_person": {"sk_movie_id": "movie", "sk_person_id": "person"},
        "movie_reviews": {
            "sk_movie_review_id": "review",
            "sk_movie_id": "movie",
            "nome": "Pessoa",
            "nota": "9.8",
            "comentario": "Ótimo, recomendo!",
        },
    }
    for filename, table_name in FILES.items():
        columns = [
            c.name for c in Base.metadata.tables[table_name].columns if c.server_default is None
        ]
        with (folder / filename).open("w", encoding="utf-8-sig", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=columns)
            writer.writeheader()
            writer.writerow(data[table_name])
    return folder


def test_import_zips_preserves_existing_dimensions_and_is_repeatable(engine, sources, tmp_path):
    with engine.begin() as db:
        db.execute(
            Base.metadata.tables["dim_genres"].insert(),
            {"sk_genre_id": "local-genre", "nome_genero": "Drama"},
        )
        db.execute(
            Base.metadata.tables["dim_movies"].insert(),
            {"sk_movie_id": "local-movie", "id_filme": "local", "titulo": "Cadastro local"},
        )
    archive = tmp_path / "bases.zip"
    with ZipFile(archive, "w") as zip_file:
        for file in sources.iterdir():
            zip_file.write(file, f"nested/{file.name}")
    first = import_sources(engine, [archive])
    assert first["dim_genres"] == {"inserted": 0, "skipped": 1}
    with engine.begin() as db:
        db.execute(text("UPDATE dim_movies SET titulo='Editado' WHERE sk_movie_id='movie'"))
    second = import_sources(engine, [sources])
    assert all(value["inserted"] == 0 for value in second.values())
    with engine.connect() as db:
        assert db.scalar(text("SELECT count(*) FROM dim_movies")) == 2
        assert (
            db.scalar(text("SELECT titulo FROM dim_movies WHERE sk_movie_id='movie'")) == "Editado"
        )
        assert db.scalar(text("SELECT sk_genre_id FROM bridge_movie_genre")) == "local-genre"
        assert db.scalar(text("SELECT nota FROM movie_reviews")) == 9.8
        assert db.scalar(text("SELECT created_at FROM movie_reviews"))
        assert db.scalar(text("SELECT qtd_tmdb FROM fact_movies_performance")) == 12
        assert (
            db.scalar(text("SELECT url_poster FROM dim_movies WHERE sk_movie_id='movie'")) is None
        )
        assert not db.execute(text("PRAGMA foreign_key_check")).all()


@pytest.mark.parametrize("invalid", ["foreign_key", "score", "integer", "header"])
def test_invalid_source_rolls_back_entire_import(engine, sources, invalid):
    name, before, after = {
        "foreign_key": ("movies_reviews.csv", "review,movie,", "review,missing,"),
        "score": ("movies_reviews.csv", "9.8", "11"),
        "integer": ("dim_movies.csv", "2020.0", "2020.5"),
        "header": ("movies_reviews.csv", "comentario", "unknown"),
    }[invalid]
    file = sources / name
    content = file.read_text(encoding="utf-8-sig")
    assert before in content
    file.write_text(content.replace(before, after), encoding="utf-8")
    with pytest.raises((ValueError, IntegrityError)):
        import_sources(engine, [sources])
    with engine.connect() as db:
        for table in Base.metadata.tables.values():
            assert db.scalar(select(func.count()).select_from(table)) == 0


def test_missing_csv_fails_before_writing(engine, sources):
    (sources / "movies_reviews.csv").unlink()
    with pytest.raises(ValueError, match="CSVs ausentes"):
        import_sources(engine, [sources])


def test_duplicate_sources_are_rejected(engine, sources):
    with pytest.raises(ValueError, match="mais de uma vez"):
        import_sources(engine, [sources, sources])


def test_import_normalizes_extra_csv_quotes_without_changing_other_titles(engine, sources):
    movies_file = sources / "dim_movies.csv"
    with movies_file.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        columns = reader.fieldnames
        rows = list(reader)
    rows[0]["titulo"] = '"wwe Rivals: Bret ""the Hitman"" Hart Vs. Shawn Michaels"""'
    with movies_file.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)

    with engine.begin() as db:
        db.execute(
            Base.metadata.tables["dim_movies"].insert(),
            {
                "sk_movie_id": "manual",
                "id_filme": "manual-uuid",
                "titulo": '"Filme ""intencional"""',
            },
        )
    import_sources(engine, [sources])
    with engine.connect() as db:
        assert db.scalar(text("SELECT titulo FROM dim_movies WHERE sk_movie_id='movie'")) == (
            'wwe Rivals: Bret "the Hitman" Hart Vs. Shawn Michaels'
        )
        assert db.scalar(text("SELECT titulo FROM dim_movies WHERE sk_movie_id='manual'")) == (
            '"Filme ""intencional"""'
        )


def test_migration_repairs_existing_imported_titles_only(tmp_path, monkeypatch):
    database_url = f"sqlite+aiosqlite:///{(tmp_path / 'migration.db').as_posix()}"
    monkeypatch.setenv("DATABASE_URL", database_url)
    get_settings.cache_clear()
    config = Config("alembic.ini")
    command.upgrade(config, "0001_initial_movie_schema")
    engine = create_engine(database_url.replace("+aiosqlite", ""))
    try:
        with engine.begin() as db:
            db.execute(
                Base.metadata.tables["dim_movies"].insert(),
                [
                    {"sk_movie_id": "imported", "id_filme": "123", "titulo": '"""blessed"""'},
                    {
                        "sk_movie_id": "extra-quote",
                        "id_filme": "789",
                        "titulo": '"wwe Rivals: Bret ""the Hitman"" Hart Vs. Shawn Michaels"""',
                    },
                    {"sk_movie_id": "ordinary", "id_filme": "456", "titulo": '"The End"'},
                    {
                        "sk_movie_id": "manual",
                        "id_filme": "manual-uuid",
                        "titulo": '"Filme ""intencional"""',
                    },
                ],
            )
        command.upgrade(config, "head")
        command.check(config)
        with engine.connect() as db:
            titles = dict(db.execute(text("SELECT sk_movie_id, titulo FROM dim_movies")).all())
            assert titles == {
                "imported": "blessed",
                "extra-quote": 'wwe Rivals: Bret "the Hitman" Hart Vs. Shawn Michaels',
                "ordinary": '"The End"',
                "manual": '"Filme ""intencional"""',
            }
    finally:
        engine.dispose()
        get_settings.cache_clear()
