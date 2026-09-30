"""add impact / steps_to_reproduce / severity_justification to findings

Optional richer detail sections, populated only when a scanner supplies the
data (Semgrep impact, ZAP instances, CVSS/confidence, SARIF codeFlows). The
finding detail hides any section that stays empty.

Revision ID: e7f2a3c9b8d1
Revises: d4b9c6e8a1f2
Create Date: 2026-09-30
"""
from typing import Union

from alembic import op
import sqlalchemy as sa

revision: str = "e7f2a3c9b8d1"
down_revision: Union[str, None] = "d4b9c6e8a1f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("findings", sa.Column("impact", sa.Text(), nullable=True))
    op.add_column("findings", sa.Column("steps_to_reproduce", sa.Text(), nullable=True))
    op.add_column("findings", sa.Column("severity_justification", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("findings", "severity_justification")
    op.drop_column("findings", "steps_to_reproduce")
    op.drop_column("findings", "impact")
