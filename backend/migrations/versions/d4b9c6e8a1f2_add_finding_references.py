"""add references column to findings

Stores the scanner-supplied reference URLs (Trivy, ZAP, etc.) as a JSON
array string so the finding detail can show a References section when the
scanner provides links, and hide it when it doesn't.

Revision ID: d4b9c6e8a1f2
Revises: c3a8e2f1b7d5
Create Date: 2026-09-30
"""
from typing import Union

from alembic import op
import sqlalchemy as sa

revision: str = "d4b9c6e8a1f2"
down_revision: Union[str, None] = "c3a8e2f1b7d5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Column is "reference_urls"; "references" is a SQL reserved word.
    op.add_column("findings", sa.Column("reference_urls", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("findings", "reference_urls")
