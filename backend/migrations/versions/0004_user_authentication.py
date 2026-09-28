"""Adiciona usuários, sessões e listas individuais preservando as entradas antigas.

Revision ID: 0004_user_authentication
Revises: 0003_movie_collections
"""

import sqlalchemy as sa
from alembic import op

revision: str = "0004_user_authentication"
down_revision: str | None = "0003_movie_collections"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("display_name", sa.String(120), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(10), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("role IN ('admin', 'user')", name="user_role_valid"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_table(
        "user_sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(32), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("csrf_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"])

    op.create_table(
        "movie_collections_new",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("sk_movie_id", sa.String(64), sa.ForeignKey("dim_movies.sk_movie_id", ondelete="CASCADE"), nullable=False),
        sa.Column("collection", sa.String(16), nullable=False),
        sa.Column("user_id", sa.String(32), sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.CheckConstraint("collection IN ('favorites', 'watchlist')", name="collection_name_valid"),
        sa.UniqueConstraint("user_id", "sk_movie_id", "collection", name="uq_movie_collections_user_movie_collection"),
    )
    op.execute(
        "INSERT INTO movie_collections_new (sk_movie_id, collection, user_id) "
        "SELECT sk_movie_id, collection, NULL FROM movie_collections"
    )
    op.drop_index("ix_movie_collections_collection_movie", table_name="movie_collections")
    op.drop_table("movie_collections")
    op.rename_table("movie_collections_new", "movie_collections")
    op.create_index(
        "ix_movie_collections_user_collection_movie", "movie_collections",
        ["user_id", "collection", "sk_movie_id"],
    )
    with op.batch_alter_table("movie_reviews") as batch:
        batch.add_column(
            sa.Column("user_id", sa.String(32), sa.ForeignKey("users.id", ondelete="SET NULL"))
        )
    op.create_index("ix_movie_reviews_user_id", "movie_reviews", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_movie_reviews_user_id", table_name="movie_reviews")
    with op.batch_alter_table("movie_reviews") as batch:
        batch.drop_column("user_id")
    op.create_table(
        "movie_collections_old",
        sa.Column("sk_movie_id", sa.String(64), sa.ForeignKey("dim_movies.sk_movie_id", ondelete="CASCADE"), primary_key=True),
        sa.Column("collection", sa.String(16), primary_key=True),
        sa.CheckConstraint("collection IN ('favorites', 'watchlist')", name="collection_name_valid"),
    )
    op.execute(
        "INSERT INTO movie_collections_old (sk_movie_id, collection) "
        "SELECT DISTINCT sk_movie_id, collection FROM movie_collections"
    )
    op.drop_index("ix_movie_collections_user_collection_movie", table_name="movie_collections")
    op.drop_table("movie_collections")
    op.rename_table("movie_collections_old", "movie_collections")
    op.create_index(
        "ix_movie_collections_collection_movie", "movie_collections", ["collection", "sk_movie_id"]
    )
    op.drop_index("ix_user_sessions_user_id", table_name="user_sessions")
    op.drop_table("user_sessions")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
