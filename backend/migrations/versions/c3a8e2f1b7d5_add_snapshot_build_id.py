"""add build_id to scan_snapshots

Revision ID: c3a8e2f1b7d5
Revises: b2f7c1a9d3e4
Create Date: 2026-09-29

Groups all the imports of one CI build (which each land as a separate scan)
into a single Analytics trend point, so the trend reads one point per build on
the same tag instead of one per scanner report.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3a8e2f1b7d5"
down_revision: Union[str, None] = "b2f7c1a9d3e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("scan_snapshots", sa.Column("build_id", sa.String(length=128), nullable=True))
    op.create_index("ix_scan_snapshots_build_id", "scan_snapshots", ["build_id"])


def downgrade() -> None:
    op.drop_index("ix_scan_snapshots_build_id", table_name="scan_snapshots")
    op.drop_column("scan_snapshots", "build_id")
