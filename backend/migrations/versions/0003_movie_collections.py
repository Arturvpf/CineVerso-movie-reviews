"""Adiciona listas de favoritos e watchlist.

Revision ID: 0003_movie_collections
Revises: 0002_movie_titles
"""

import sqlalchemy as sa
from alembic import op

revision: str = "0003_movie_collections"
down_revision: str | None = "0002_movie_titles"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "movie_collections",
        sa.Column(
            "sk_movie_id",
            sa.String(64),
            sa.ForeignKey("dim_movies.sk_movie_id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("collection", sa.String(16), primary_key=True),
        sa.CheckConstraint(
            "collection IN ('favorites', 'watchlist')", name="collection_name_valid"
        ),
    )
    op.create_index(
        "ix_movie_collections_collection_movie",
        "movie_collections",
        ["collection", "sk_movie_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_movie_collections_collection_movie", table_name="movie_collections")
    op.drop_table("movie_collections")
