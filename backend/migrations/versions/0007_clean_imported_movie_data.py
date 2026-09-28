"""Normaliza sinopses e durações ausentes da base oficial.

Revision ID: 0007_clean_imported_movie_data
Revises: 0006_avatars_unique_reviews
"""

import sqlalchemy as sa
from alembic import op

revision = "0007_clean_imported_movie_data"
down_revision = "0006_avatars_unique_reviews"
branch_labels = None
depends_on = None


def upgrade() -> None:
    movies = sa.table(
        "dim_movies",
        sa.column("sk_movie_id", sa.String()),
        sa.column("id_filme", sa.String()),
        sa.column("sinopse", sa.String()),
        sa.column("duracao_minutos", sa.Integer()),
    )
    connection = op.get_bind()
    rows = connection.execute(
        sa.select(
            movies.c.sk_movie_id, movies.c.id_filme,
            movies.c.sinopse, movies.c.duracao_minutos,
        ).where(
            sa.or_(movies.c.duracao_minutos == 0, movies.c.sinopse.startswith('"'))
        )
    )
    for movie_id, source_id, synopsis, duration in rows:
        if not source_id.isascii() or not source_id.isdigit():
            continue
        values = {}
        if duration == 0:
            values["duracao_minutos"] = None
        if synopsis and synopsis.startswith('"') and synopsis.endswith('"') and '""' in synopsis:
            values["sinopse"] = synopsis[1:-1].replace('""', '"')
        if values:
            connection.execute(
                sa.update(movies).where(movies.c.sk_movie_id == movie_id).values(**values)
            )


def downgrade() -> None:
    # A limpeza não é revertida para preservar correções feitas após a migração.
    pass
