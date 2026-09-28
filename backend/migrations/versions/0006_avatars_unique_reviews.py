"""Fotos de perfil e uma avaliação ativa por conta e filme.

Revision ID: 0006_avatars_unique_reviews
Revises: 0005_problem_reports
"""

import sqlalchemy as sa
from alembic import op

revision = "0006_avatars_unique_reviews"
down_revision = "0005_problem_reports"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("avatar_data", sa.LargeBinary(), nullable=True))
        batch.add_column(sa.Column("avatar_mime", sa.String(20), nullable=True))
        batch.add_column(sa.Column("avatar_updated_at", sa.DateTime(), nullable=True))

    # Preserva as avaliações anteriores ao manter apenas a mais recente ativa.
    op.create_table(
        "archived_duplicate_reviews",
        sa.Column("sk_movie_review_id", sa.String(64), primary_key=True),
        sa.Column("sk_movie_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(32), nullable=False),
        sa.Column("nome", sa.String(120), nullable=False),
        sa.Column("nota", sa.Double(), nullable=False),
        sa.Column("comentario", sa.String(4000), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    duplicates = """
        SELECT sk_movie_review_id FROM (
          SELECT sk_movie_review_id,
            row_number() OVER (
              PARTITION BY user_id, sk_movie_id
              ORDER BY created_at DESC, rowid DESC
            ) AS rank
          FROM movie_reviews WHERE user_id IS NOT NULL
        ) WHERE rank > 1
    """
    op.execute(sa.text(f"""
        INSERT INTO archived_duplicate_reviews
          (sk_movie_review_id, sk_movie_id, user_id, nome, nota, comentario, created_at)
        SELECT sk_movie_review_id, sk_movie_id, user_id, nome, nota, comentario, created_at
        FROM movie_reviews WHERE sk_movie_review_id IN ({duplicates})
    """))
    op.execute(sa.text(f"DELETE FROM movie_reviews WHERE sk_movie_review_id IN ({duplicates})"))
    op.create_index(
        "uq_movie_reviews_user_movie", "movie_reviews", ["user_id", "sk_movie_id"],
        unique=True, sqlite_where=sa.text("user_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_movie_reviews_user_movie", table_name="movie_reviews")
    op.execute(sa.text("""
        INSERT INTO movie_reviews
          (sk_movie_review_id, sk_movie_id, user_id, nome, nota, comentario, created_at)
        SELECT sk_movie_review_id, sk_movie_id, user_id, nome, nota, comentario, created_at
        FROM archived_duplicate_reviews
    """))
    op.drop_table("archived_duplicate_reviews")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("avatar_updated_at")
        batch.drop_column("avatar_mime")
        batch.drop_column("avatar_data")
