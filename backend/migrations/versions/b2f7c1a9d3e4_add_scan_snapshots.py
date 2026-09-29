"""add scan_snapshots table

Revision ID: b2f7c1a9d3e4
Revises: 861b998fd525
Create Date: 2026-09-29

Append-only per-tag history of finding counts at each import, so the Analytics
trend shows progress even when scans are re-imported into the same tag.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b2f7c1a9d3e4"
down_revision: Union[str, None] = "861b998fd525"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "scan_snapshots",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("application_id", sa.String(length=36), nullable=False),
        sa.Column("image_tag_id", sa.String(length=36), nullable=False),
        sa.Column("tag", sa.String(length=256), nullable=False),
        sa.Column("imported_at", sa.DateTime(), nullable=True),
        sa.Column("total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("open", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("mitigated", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("critical", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("high", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("medium", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("low", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("info", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["application_id"], ["applications.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["image_tag_id"], ["image_tags.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_scan_snapshots_application_id", "scan_snapshots", ["application_id"])
    op.create_index("ix_scan_snapshots_image_tag_id", "scan_snapshots", ["image_tag_id"])
    op.create_index("ix_scan_snapshots_imported_at", "scan_snapshots", ["imported_at"])
    op.create_index("ix_snap_tag_time", "scan_snapshots", ["image_tag_id", "imported_at"])


def downgrade() -> None:
    op.drop_index("ix_snap_tag_time", table_name="scan_snapshots")
    op.drop_index("ix_scan_snapshots_imported_at", table_name="scan_snapshots")
    op.drop_index("ix_scan_snapshots_image_tag_id", table_name="scan_snapshots")
    op.drop_index("ix_scan_snapshots_application_id", table_name="scan_snapshots")
    op.drop_table("scan_snapshots")
