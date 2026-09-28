"""Carga transacional dos CSVs oficiais, diretamente de ZIPs ou diretórios."""

import argparse
import csv
import io
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from zipfile import ZipFile

from sqlalchemy import Date, DateTime, Double, Integer, Numeric, String, create_engine, select
from sqlalchemy.engine import Engine

from app.auth import models as auth_models  # noqa: F401  Registra a FK de avaliações.
from app.core.config import get_settings
from app.db.base import Base
from app.movies import models  # noqa: F401

# Pais antes dos relacionamentos. O CSV de avaliações tem um nome diferente da tabela.
FILES = {
    "dim_companies.csv": "dim_companies",
    "dim_genres.csv": "dim_genres",
    "dim_movies.csv": "dim_movies",
    "dim_people.csv": "dim_people",
    "dim_reviews.csv": "dim_reviews",
    "fact_movies_performance.csv": "fact_movies_performance",
    "bridge_movie_company.csv": "bridge_movie_company",
    "bridge_movie_genre.csv": "bridge_movie_genre",
    "bridge_movie_person.csv": "bridge_movie_person",
    "movies_reviews.csv": "movie_reviews",
}
NATURAL_KEYS = {
    "dim_companies": ("nome_produtora",),
    "dim_genres": ("nome_genero",),
    "dim_people": ("nome_pessoa", "tipo_pessoa"),
    "dim_movies": ("id_filme",),
    "dim_reviews": ("sk_movie_id",),
}


def discover_sources(paths: list[Path]) -> dict[str, tuple[Path, str | None]]:
    sources = {}
    for path in paths:
        if path.is_dir():
            entries = [(file.name, (file, None)) for file in path.rglob("*.csv")]
        elif path.is_file() and path.suffix.lower() == ".zip":
            with ZipFile(path) as archive:
                entries = [
                    (Path(name).name, (path, name))
                    for name in archive.namelist()
                    if not name.endswith("/")
                ]
        else:
            raise ValueError(f"Fonte inválida: {path}. Informe um ZIP ou diretório.")
        for name, source in entries:
            if name not in FILES:
                continue
            if name in sources:
                raise ValueError(f"CSV fornecido mais de uma vez: {name}")
            sources[name] = source
    missing = set(FILES) - sources.keys()
    if missing:
        raise ValueError(f"CSVs ausentes: {', '.join(sorted(missing))}")
    return sources


@contextmanager
def open_csv(source: tuple[Path, str | None]) -> Iterator[io.TextIOBase]:
    path, member = source
    if member is None:
        with path.open(encoding="utf-8-sig", newline="") as stream:
            yield stream
    else:
        with (
            ZipFile(path) as archive,
            archive.open(member) as raw,
            io.TextIOWrapper(raw, encoding="utf-8-sig", newline="") as stream,
        ):
            yield stream


def convert_value(column, value: str):
    value = value.strip()
    if value == "":
        if column.nullable:
            return None
        raise ValueError(f"{column.name}: valor obrigatório ausente")
    if isinstance(column.type, DateTime):
        return datetime.fromisoformat(value)
    if isinstance(column.type, Date):
        return date.fromisoformat(value)
    if isinstance(column.type, (Integer, Numeric, Double)):
        number = Decimal(value)
        if not number.is_finite():
            raise ValueError(f"{column.name}: número não finito")
        if isinstance(column.type, Integer):
            if number != number.to_integral_value():
                raise ValueError(f"{column.name}: esperado inteiro")
            return int(number)
        return float(number) if isinstance(column.type, Double) else number
    if isinstance(column.type, String) and len(value) > column.type.length:
        raise ValueError(f"{column.name}: texto excede {column.type.length} caracteres")
    return value


def normalize_imported_title(title: str) -> str:
    """Remove uma camada de aspas CSV duplicadas nos títulos da base oficial."""

    if title.startswith('"') and title.endswith('"') and '""' in title:
        normalized = title[1:-1].replace('""', '"')
        if title.startswith('"""') and title.endswith('"""'):
            return normalized[1:-1]
        # Uma linha da base termina com uma aspa extra sem par.
        if normalized.endswith('"') and normalized.count('"') % 2:
            return normalized[:-1]
        return normalized
    return title


def normalize_imported_synopsis(synopsis: str | None) -> str | None:
    """Desfaz apenas a camada de aspas duplicada reconhecível na fonte."""

    if synopsis and synopsis.startswith('"') and synopsis.endswith('"') and '""' in synopsis:
        return synopsis[1:-1].replace('""', '"')
    return synopsis


def import_sources(engine: Engine, paths: list[Path]) -> dict[str, dict[str, int]]:
    if engine.dialect.name != "sqlite":
        raise ValueError("A importação suporta SQLite.")
    sources = discover_sources(paths)
    report = {}
    remapped: dict[str, dict[str, str]] = {}
    with engine.connect() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        connection.commit()
        # Obtém o bloqueio antes das leituras para impedir alterações concorrentes na carga.
        connection.exec_driver_sql("BEGIN IMMEDIATE")
        try:
            for filename, table_name in FILES.items():
                table = Base.metadata.tables[table_name]
                primary = tuple(column.name for column in table.primary_key)
                natural = NATURAL_KEYS.get(table_name, ())
                fields = list(dict.fromkeys((*primary, *natural)))
                existing = connection.execute(select(*(table.c[name] for name in fields)))
                keys = set()
                by_natural = {}
                for row in existing.mappings():
                    key = tuple(row[name] for name in primary)
                    keys.add(key)
                    if natural:
                        by_natural[tuple(row[name] for name in natural)] = key[0]
                aliases = remapped.setdefault(table_name, {})
                added = skipped = 0
                batch = []
                with open_csv(sources[filename]) as stream:
                    reader = csv.DictReader(stream)
                    headers = reader.fieldnames or []
                    required = {
                        col.name for col in table.columns
                        if col.server_default is None and not col.nullable
                    }
                    if (
                        not required.issubset(headers)
                        or set(headers) - set(table.c.keys())
                        or len(headers) != len(set(headers))
                    ):
                        raise ValueError(f"{filename}: cabeçalho incompatível com {table_name}")
                    for line, raw in enumerate(reader, start=2):
                        try:
                            if None in raw or any(value is None for value in raw.values()):
                                raise ValueError("quantidade de colunas inválida")
                            row = {
                                name: convert_value(table.c[name], value)
                                for name, value in raw.items()
                            }
                            if table_name == "dim_movies":
                                row["titulo"] = normalize_imported_title(row["titulo"])
                                row["sinopse"] = normalize_imported_synopsis(row.get("sinopse"))
                                if row.get("duracao_minutos") == 0:
                                    row["duracao_minutos"] = None
                            for fk in table.foreign_keys:
                                name = fk.parent.name
                                if name not in row or row[name] is None:
                                    continue
                                row[name] = remapped.get(fk.column.table.name, {}).get(
                                    row[name], row[name]
                                )
                            key = tuple(row[name] for name in primary)
                            if key in keys:
                                skipped += 1
                                continue
                            natural_key = tuple(row[name] for name in natural)
                            if natural and natural_key in by_natural:
                                aliases[key[0]] = by_natural[natural_key]
                                skipped += 1
                                continue
                            keys.add(key)
                            if natural:
                                by_natural[natural_key] = key[0]
                            batch.append(row)
                            added += 1
                            if len(batch) == 2000:
                                connection.execute(table.insert(), batch)
                                batch.clear()
                        except Exception as exc:
                            raise ValueError(f"{filename}, perto da linha {line}: {exc}") from exc
                if batch:
                    connection.execute(table.insert(), batch)
                report[table_name] = {"inserted": added, "skipped": skipped}
                print(f"{table_name}: {added} novos, {skipped} já existentes", flush=True)
            if connection.exec_driver_sql("PRAGMA foreign_key_check").first():
                raise ValueError("Falha na integridade dos relacionamentos.")
            connection.commit()
        except BaseException:
            connection.rollback()
            raise
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sources", nargs="+", type=Path, help="ZIPs ou diretórios com os 10 CSVs")
    args = parser.parse_args()
    engine = create_engine(get_settings().database_url.replace("+aiosqlite", ""))
    try:
        import_sources(engine, args.sources)
    except Exception as exc:
        parser.exit(1, f"Importação cancelada; nenhuma alteração da carga foi salva. {exc}\n")
    finally:
        engine.dispose()
    print("Importação concluída e confirmada.")


if __name__ == "__main__":
    main()
