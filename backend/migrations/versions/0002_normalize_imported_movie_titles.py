"""Corrige aspas duplicadas nos títulos importados da base oficial.

Revision ID: 0002_movie_titles
Revises: 0001_initial_movie_schema
"""

import sqlalchemy as sa
from alembic import op

revision: str = "0002_movie_titles"
down_revision: str | None = "0001_initial_movie_schema"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    movies = sa.table(
        "dim_movies",
        sa.column("sk_movie_id", sa.String()),
        sa.column("id_filme", sa.String()),
        sa.column("titulo", sa.String()),
    )
    connection = op.get_bind()
    rows = connection.execute(
        sa.select(movies.c.sk_movie_id, movies.c.id_filme, movies.c.titulo)
        .where(movies.c.titulo.startswith('"'))
    )
    for movie_id, source_id, title in rows:
        # IDs numéricos são os da base oficial; cadastros manuais usam UUID.
        if source_id.isascii() and source_id.isdigit() and title.endswith('"') and '""' in title:
            normalized = title[1:-1].replace('""', '"')
            if title.startswith('"""') and title.endswith('"""'):
                normalized = normalized[1:-1]
            elif normalized.endswith('"') and normalized.count('"') % 2:
                normalized = normalized[:-1]
            connection.execute(
                sa.update(movies).where(movies.c.sk_movie_id == movie_id).values(titulo=normalized)
            )


def downgrade() -> None:
    # A limpeza de dados não é revertida para não sobrescrever edições posteriores.
    pass
