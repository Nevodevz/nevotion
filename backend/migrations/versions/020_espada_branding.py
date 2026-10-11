"""Rename the built-in Labs department and untouched company text to Espada.

Revision ID: 020
Revises: 019

Keep employee emails, IDs, membership, boards and API key hashes unchanged.
"""
from alembic import op
import sqlalchemy as sa


revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None

departments = sa.table(
    "departments",
    sa.column("slug", sa.String),
    sa.column("name", sa.String),
    sa.column("kind", sa.String),
    sa.column("content", sa.Text),
)
LEGACY_ABOUT = (
    "NevoDevs — команда по разработке AI-чатботов для бизнеса в Бишкеке.\n\n"
    "Заполните этот раздел через редактирование (доступно руководителю)."
)
ESPADA_ABOUT = LEGACY_ABOUT.replace("NevoDevs", "Espada")


def _rename_labs(old_slug: str, new_slug: str, old_name: str, new_name: str) -> None:
    literal = op.inline_literal
    op.execute(
        departments.update()
        .where(departments.c.slug == literal(old_slug))
        .values(
            slug=literal(new_slug),
            name=sa.case(
                (departments.c.name == literal(old_name), literal(new_name)),
                else_=departments.c.name,
            ),
            kind=sa.case(
                (departments.c.kind == literal(old_slug), literal(new_slug)),
                else_=departments.c.kind,
            ),
        )
    )


def _rename_about(old_content: str, new_content: str) -> None:
    literal = op.inline_literal
    op.execute(
        departments.update()
        .where(departments.c.slug == literal("about"))
        .where(departments.c.content == literal(old_content))
        .values(content=literal(new_content))
    )


def upgrade() -> None:
    _rename_labs("nevolabs", "espadalabs", "NevoLabs", "Espada Labs")
    _rename_about(LEGACY_ABOUT, ESPADA_ABOUT)


def downgrade() -> None:
    _rename_labs("espadalabs", "nevolabs", "Espada Labs", "NevoLabs")
    _rename_about(ESPADA_ABOUT, LEGACY_ABOUT)
