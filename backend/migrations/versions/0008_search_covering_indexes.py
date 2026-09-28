"""Índices de cobertura para busca por pessoas e produtoras."""

from alembic import op

revision = "0008_search_covering_indexes"
down_revision = "0007_clean_imported_movie_data"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_bridge_person_movie", "bridge_movie_person", ["sk_person_id", "sk_movie_id"])
    op.create_index("ix_bridge_company_movie", "bridge_movie_company", ["sk_company_id", "sk_movie_id"])


def downgrade() -> None:
    op.drop_index("ix_bridge_company_movie", table_name="bridge_movie_company")
    op.drop_index("ix_bridge_person_movie", table_name="bridge_movie_person")
