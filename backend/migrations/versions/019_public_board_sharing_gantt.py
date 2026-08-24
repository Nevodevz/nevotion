"""Public board sharing and task start dates for Gantt views.

Revision ID: 019
Revises: 018
"""
from alembic import op
import sqlalchemy as sa


revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("start_date", sa.Date(), nullable=True))
    op.create_table(
        "board_shares",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "board_id",
            sa.Integer(),
            sa.ForeignKey("boards.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("token_prefix", sa.String(12), nullable=False),
        sa.Column(
            "created_by",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("token_hash", name="uq_board_shares_token_hash"),
    )
    op.create_index("ix_board_shares_board_id", "board_shares", ["board_id"])
    op.create_index("ix_board_shares_token_hash", "board_shares", ["token_hash"])


def downgrade() -> None:
    op.drop_index("ix_board_shares_token_hash", table_name="board_shares")
    op.drop_index("ix_board_shares_board_id", table_name="board_shares")
    op.drop_table("board_shares")
    op.drop_column("tasks", "start_date")
