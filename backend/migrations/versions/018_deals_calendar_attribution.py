"""Deal-centric finance, payment schedule, internal calendar, avatars, attribution.

Covers:
  * user avatars (avatar_url)
  * lead_stages.is_archived + archiving «Демо-тест» and moving its leads to «Созвон»
  * lead attribution fields (source detail / content ref / UTM / external id)
  * deal_payments — the payment schedule; Deal.amount becomes canonical
  * backfill: a Deal for every lead that has none, seeded from potential_amount
  * meetings: `not_held` status + duration_minutes for the calendar hour grid
  * tasks: structured `kind` (task | meeting) with time window and location

Revision ID: 018
Revises: 017
"""
from datetime import date

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '018'
down_revision = '017'
branch_labels = None
depends_on = None

ARCHIVED_STAGE_NAME = "Демо-тест"
FALLBACK_STAGE_NAME = "Созвон"
MIGRATION_NOTE = (
    "Системный перенос: этап «Демо-тест» архивирован, лид перемещён на активный этап"
)


def _is_postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def _enum_type(name: str, *values: str):
    """Enum whose type is created explicitly, exactly once.

    On PostgreSQL, ``create_table`` would otherwise emit its own ``CREATE TYPE``
    and collide with the explicit ``.create()`` call below, so auto-creation is
    turned off and the type is managed by hand.
    """
    if _is_postgres():
        return postgresql.ENUM(*values, name=name, create_type=False)
    return sa.Enum(*values, name=name)


def upgrade() -> None:
    conn = op.get_bind()

    # ── Users: avatar ────────────────────────────────────────────
    op.add_column("users", sa.Column("avatar_url", sa.String(500), nullable=False, server_default=""))

    # ── Lead stages: archiving ───────────────────────────────────
    op.add_column(
        "lead_stages",
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    # ── Leads: attribution ───────────────────────────────────────
    for col in ("source_detail", "utm_source", "utm_medium", "utm_campaign", "utm_content", "external_lead_id"):
        op.add_column("leads", sa.Column(col, sa.String(200), nullable=False, server_default=""))
    op.add_column("leads", sa.Column("content_ref", sa.String(500), nullable=False, server_default=""))
    op.create_index("ix_leads_external_lead_id", "leads", ["external_lead_id"])

    # ── Meetings: not_held + duration ────────────────────────────
    if _is_postgres():
        # PostgreSQL 12+ allows ADD VALUE inside a transaction as long as the new
        # value is not *used* in the same transaction — this migration never
        # writes 'not_held', so the whole upgrade stays atomic.
        # IF NOT EXISTS keeps a re-run safe.
        op.execute("ALTER TYPE meetingstatus ADD VALUE IF NOT EXISTS 'not_held'")

    # Meetings had no end time. The internal calendar needs one to place them on
    # the hour grid; 60 minutes is the safe fallback for every existing row.
    op.add_column(
        "meetings",
        sa.Column("duration_minutes", sa.Integer(), nullable=False, server_default="60"),
    )

    # ── Tasks: structured kind + meeting fields ──────────────────
    task_kind = _enum_type("taskkind", "task", "meeting")
    task_kind.create(conn, checkfirst=True)
    op.add_column("tasks", sa.Column("kind", task_kind, nullable=False, server_default="task"))
    op.add_column("tasks", sa.Column("start_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tasks", sa.Column("end_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tasks", sa.Column("location", sa.String(500), nullable=False, server_default=""))

    # ── Payment schedule ─────────────────────────────────────────
    payment_status = _enum_type("paymentstatus", "planned", "partial", "paid", "cancelled")
    payment_status.create(conn, checkfirst=True)
    op.create_table(
        "deal_payments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("deal_id", sa.Integer(), sa.ForeignKey("deals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("planned_date", sa.Date(), nullable=False),
        sa.Column("planned_amount", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("paid_amount", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("paid_date", sa.Date(), nullable=True),
        sa.Column("status", payment_status, nullable=False, server_default="planned"),
        sa.Column("payment_method", sa.String(120), nullable=False, server_default=""),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("comment", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "finance_transaction_id", sa.Integer(),
            sa.ForeignKey("finance_transactions.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_deal_payments_deal_id", "deal_payments", ["deal_id"])
    op.create_index("ix_deal_payments_planned_date", "deal_payments", ["planned_date"])
    op.create_index("ix_deal_payments_finance_tx", "deal_payments", ["finance_transaction_id"])

    # ── Data migration ───────────────────────────────────────────
    _migrate_demo_test_stage(conn)
    _backfill_deals_and_schedule(conn)


def _migrate_demo_test_stage(conn) -> None:
    """Archive «Демо-тест» and move its leads onto an active stage.

    Nothing is deleted: the stage row, its leads and every history entry survive,
    and each moved lead gets a system history entry explaining the move.
    """
    stage = conn.execute(
        sa.text("SELECT id FROM lead_stages WHERE name = :n"), {"n": ARCHIVED_STAGE_NAME}
    ).fetchone()
    if stage is None:
        return
    stage_id = stage[0]

    target = conn.execute(
        sa.text(
            "SELECT id FROM lead_stages "
            "WHERE name = :n AND is_won = false AND is_lost = false AND is_archived = false"
        ),
        {"n": FALLBACK_STAGE_NAME},
    ).fetchone()

    if target is None:
        # Fallback: first non-final, non-archived stage by position.
        target = conn.execute(
            sa.text(
                "SELECT id FROM lead_stages "
                "WHERE is_won = false AND is_lost = false AND is_archived = false AND id <> :sid "
                "ORDER BY position LIMIT 1"
            ),
            {"sid": stage_id},
        ).fetchone()

    if target is not None:
        target_id = target[0]
        moved = conn.execute(
            sa.text("SELECT id FROM leads WHERE stage_id = :sid"), {"sid": stage_id}
        ).fetchall()
        for (lead_id,) in moved:
            conn.execute(
                sa.text(
                    "INSERT INTO lead_stage_history "
                    "(lead_id, from_stage_id, to_stage_id, changed_by, comment) "
                    "VALUES (:lid, :from_id, :to_id, NULL, :c)"
                ),
                {"lid": lead_id, "from_id": stage_id, "to_id": target_id, "c": MIGRATION_NOTE},
            )
        conn.execute(
            sa.text("UPDATE leads SET stage_id = :tid WHERE stage_id = :sid"),
            {"tid": target_id, "sid": stage_id},
        )

    conn.execute(
        sa.text("UPDATE lead_stages SET is_archived = true WHERE id = :sid"), {"sid": stage_id}
    )


def _backfill_deals_and_schedule(conn) -> None:
    """Make Deal.amount the canonical amount for every existing lead.

    * Leads without a Deal get one, seeded from the legacy ``potential_amount``.
    * Deals with amount 0 but a non-zero lead potential adopt that potential.
    * Existing ``paid_amount`` becomes a confirmed schedule row so the derived
      totals match what the old columns reported.
    * Deal statuses are recomputed into pending / partial / paid.
    """
    leads = conn.execute(
        sa.text("SELECT id, potential_amount, actual_amount, setter_id, closer_id FROM leads")
    ).fetchall()

    for lead_id, potential, actual, setter_id, closer_id in leads:
        potential = int(potential or 0)
        actual = int(actual or 0)
        deal = conn.execute(
            sa.text(
                "SELECT id, amount, paid_amount, payment_date, payment_method, status "
                "FROM deals WHERE lead_id = :lid ORDER BY created_at DESC, id DESC LIMIT 1"
            ),
            {"lid": lead_id},
        ).fetchone()

        if deal is None:
            if potential <= 0 and actual <= 0:
                continue  # nothing financial to preserve
            # payment_method / deal_type are NOT NULL without defaults in the
            # pre-018 schema, so they must be given explicitly here.
            conn.execute(
                sa.text(
                    "INSERT INTO deals (lead_id, amount, paid_amount, payment_method, status, "
                    "deal_type, setter_id, closer_id, setter_commission, closer_commission) "
                    "VALUES (:lid, :amt, 0, '', 'pending', '', :sid, :cid, 0, 0)"
                ),
                {"lid": lead_id, "amt": max(potential, actual), "sid": setter_id, "cid": closer_id},
            )
            deal = conn.execute(
                sa.text("SELECT id, amount, paid_amount, payment_date, payment_method, status "
                        "FROM deals WHERE lead_id = :lid ORDER BY id DESC LIMIT 1"),
                {"lid": lead_id},
            ).fetchone()

        deal_id, amount, paid_amount, payment_date, payment_method, _status = deal
        amount = int(amount or 0)
        paid_amount = int(paid_amount or 0)

        if amount <= 0 and potential > 0:
            amount = potential
        if amount < paid_amount:
            # Legacy rows sometimes recorded a payment without an amount.
            amount = paid_amount
        conn.execute(
            sa.text("UPDATE deals SET amount = :a WHERE id = :d"), {"a": amount, "d": deal_id}
        )

        existing_rows = conn.execute(
            sa.text("SELECT COUNT(*) FROM deal_payments WHERE deal_id = :d"), {"d": deal_id}
        ).scalar() or 0

        if existing_rows == 0 and paid_amount > 0:
            tx = conn.execute(
                sa.text(
                    "SELECT id FROM finance_transactions "
                    "WHERE related_deal_id = :d AND type = 'income' ORDER BY id LIMIT 1"
                ),
                {"d": deal_id},
            ).fetchone()
            status = "paid" if amount > 0 and paid_amount >= amount else "partial"
            conn.execute(
                sa.text(
                    "INSERT INTO deal_payments "
                    "(deal_id, planned_date, planned_amount, paid_amount, paid_date, status, "
                    " payment_method, comment, finance_transaction_id) "
                    "VALUES (:d, :pd, :pa, :paid, :paid_d, :st, :pm, :c, :tx)"
                ),
                {
                    "d": deal_id,
                    "pd": payment_date or date.today(),
                    "pa": paid_amount,
                    "paid": paid_amount,
                    "paid_d": payment_date,
                    "st": status,
                    "pm": payment_method or "",
                    "c": "Перенос существующей оплаты в график",
                    "tx": tx[0] if tx else None,
                },
            )

        # Recompute the derived status from the (possibly new) schedule.
        confirmed = conn.execute(
            sa.text(
                "SELECT COALESCE(SUM(paid_amount), 0) FROM deal_payments "
                "WHERE deal_id = :d AND status IN ('paid', 'partial')"
            ),
            {"d": deal_id},
        ).scalar() or 0
        confirmed = int(confirmed)
        if confirmed <= 0:
            new_status = "pending"
        elif amount > 0 and confirmed >= amount:
            new_status = "paid"
        else:
            new_status = "partial"
        conn.execute(
            sa.text("UPDATE deals SET paid_amount = :p, status = :s WHERE id = :d"),
            {"p": confirmed, "s": new_status, "d": deal_id},
        )
        conn.execute(
            sa.text("UPDATE leads SET potential_amount = :a, actual_amount = :p WHERE id = :l"),
            {"a": amount, "p": confirmed, "l": lead_id},
        )


def downgrade() -> None:
    conn = op.get_bind()

    # Payment schedule: fold the confirmed totals back into deals.paid_amount so
    # the pre-018 columns stay truthful, then drop the table.
    conn.execute(sa.text(
        "UPDATE deals SET paid_amount = COALESCE(("
        "  SELECT SUM(dp.paid_amount) FROM deal_payments dp "
        "  WHERE dp.deal_id = deals.id AND dp.status IN ('paid', 'partial')"
        "), 0)"
    ))
    conn.execute(sa.text(
        "UPDATE deals SET status = CASE WHEN paid_amount > 0 AND paid_amount >= amount "
        "THEN 'paid' ELSE 'pending' END"
    ))
    op.drop_index("ix_deal_payments_finance_tx", table_name="deal_payments")
    op.drop_index("ix_deal_payments_planned_date", table_name="deal_payments")
    op.drop_index("ix_deal_payments_deal_id", table_name="deal_payments")
    op.drop_table("deal_payments")
    sa.Enum(name="paymentstatus").drop(conn, checkfirst=True)

    op.drop_column("tasks", "location")
    op.drop_column("tasks", "end_at")
    op.drop_column("tasks", "start_at")
    op.drop_column("tasks", "kind")
    sa.Enum(name="taskkind").drop(conn, checkfirst=True)

    op.drop_column("meetings", "duration_minutes")
    # NOTE: the 'not_held' value stays in the PostgreSQL enum — removing a value
    # from an enum type is not supported. Any meeting still using it is first
    # moved back to 'rescheduled' so no row references a status the old code
    # cannot render.
    conn.execute(sa.text("UPDATE meetings SET status = 'rescheduled' WHERE status = 'not_held'"))

    op.drop_index("ix_leads_external_lead_id", table_name="leads")
    for col in ("content_ref", "external_lead_id", "utm_content", "utm_campaign",
                "utm_medium", "utm_source", "source_detail"):
        op.drop_column("leads", col)

    # Un-archive the stage so the previous schema's ordering is restored.
    conn.execute(sa.text("UPDATE lead_stages SET is_archived = false"))
    op.drop_column("lead_stages", "is_archived")

    op.drop_column("users", "avatar_url")
