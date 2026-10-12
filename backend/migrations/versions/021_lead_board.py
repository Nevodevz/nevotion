"""Independent lead Kanban columns and card placement.

Revision ID: 021
Revises: 020

Existing leads, funnel stages and finance remain unchanged.
"""
from alembic import op
import sqlalchemy as sa

revision = "021"
down_revision = "020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "lead_board_columns",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("color", sa.String(7), nullable=False, server_default="#4648d4"),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_table(
        "lead_board_placements",
        sa.Column("lead_id", sa.Integer(), sa.ForeignKey("leads.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("column_id", sa.Integer(), sa.ForeignKey("lead_board_columns.id", ondelete="SET NULL"), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_lead_board_placements_column_id", "lead_board_placements", ["column_id"])


def downgrade() -> None:
    op.drop_index("ix_lead_board_placements_column_id", table_name="lead_board_placements")
    op.drop_table("lead_board_placements")
    op.drop_table("lead_board_columns")
