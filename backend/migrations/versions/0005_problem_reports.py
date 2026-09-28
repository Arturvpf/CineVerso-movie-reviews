"""Armazena relatos de problemas enviados pelos usuários.

Revision ID: 0005_problem_reports
Revises: 0004_user_authentication
"""

import sqlalchemy as sa
from alembic import op

revision: str = "0005_problem_reports"
down_revision: str | None = "0004_user_authentication"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "problem_reports",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("user_id", sa.String(32), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("movie_id", sa.String(64), sa.ForeignKey("dim_movies.sk_movie_id", ondelete="SET NULL")),
        sa.Column("category", sa.String(10), nullable=False),
        sa.Column("subject", sa.String(160), nullable=False),
        sa.Column("description", sa.String(4000), nullable=False),
        sa.Column("status", sa.String(10), server_default="open", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("resolved_at", sa.DateTime()),
        sa.CheckConstraint("category IN ('site', 'movie', 'other')", name="problem_category_valid"),
        sa.CheckConstraint("status IN ('open', 'resolved')", name="problem_status_valid"),
    )
    op.create_index(
        "ix_problem_reports_user_created", "problem_reports", ["user_id", "created_at"]
    )
    op.create_index(
        "ix_problem_reports_status_created", "problem_reports", ["status", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_problem_reports_status_created", table_name="problem_reports")
    op.drop_index("ix_problem_reports_user_created", table_name="problem_reports")
    op.drop_table("problem_reports")
