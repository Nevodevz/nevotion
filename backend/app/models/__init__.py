import enum
from datetime import datetime, date

from sqlalchemy import (
    String, Integer, Boolean, ForeignKey, Date, DateTime, Enum, func, Text, JSON, Table, Column
)
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Role(str, enum.Enum):
    admin = "admin"
    staff = "staff"


class ProjectStatus(str, enum.Enum):
    new = "new"          # Новый проект
    support = "support"  # Тех поддержка


class Priority(str, enum.Enum):
    low = "low"
    med = "med"
    high = "high"


# Many-to-many: users <-> departments
user_departments = Table(
    "user_departments",
    Base.metadata,
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("department_id", ForeignKey("departments.id", ondelete="CASCADE"), primary_key=True),
)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[Role] = mapped_column(Enum(Role), default=Role.staff, nullable=False)
    position: Mapped[str] = mapped_column(String(80), default="Сотрудник")
    is_founder: Mapped[bool] = mapped_column(Boolean, default=False)  # доступ к скрытой части
    avatar_color: Mapped[str] = mapped_column(String(20), default="indigo")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)  # False = archived
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    projects: Mapped[list["Project"]] = relationship(back_populates="owner")
    tasks: Mapped[list["Task"]] = relationship(back_populates="owner", foreign_keys="Task.owner_id")
    departments: Mapped[list["Department"]] = relationship(secondary=user_departments, back_populates="members")


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(60), unique=True)
    icon: Mapped[str] = mapped_column(String(40), default="folder")
    admin_only: Mapped[bool] = mapped_column(Boolean, default=False)
    kind: Mapped[str] = mapped_column(String(40), default="generic")  # generic | dev | sales | marketing | qcc | finance | about | hidden
    content: Mapped[str] = mapped_column(Text, default="")        # for "about" page
    embed_url: Mapped[str] = mapped_column(String(500), default="")  # for finance iframe

    members: Mapped[list["User"]] = relationship(secondary=user_departments, back_populates="departments")


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    company: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[ProjectStatus] = mapped_column(Enum(ProjectStatus, name="projectstatus"), default=ProjectStatus.new)
    # Sub-status for "new" projects: "Сбор информации" | "Разработка" | "Тест" | "Сдан"
    sub_status: Mapped[str | None] = mapped_column(String(40), nullable=True)
    price: Mapped[int] = mapped_column(Integer, default=0)        # salary contribution
    color: Mapped[str] = mapped_column(String(20), default="green")  # red|yellow|blue|green
    bot_comment: Mapped[str] = mapped_column(Text, default="")
    connected_at: Mapped[date] = mapped_column(Date, default=date.today)
    delivered_at: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    notes: Mapped[str] = mapped_column(String(500), default="")
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    lead_id: Mapped[int | None] = mapped_column(ForeignKey("leads.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner: Mapped["User"] = relationship(back_populates="projects")


class Board(Base):
    """A kanban board. Each user has a personal board; departments can have shared boards
    (backend queue, QCC tracker). Columns are dynamic and editable."""
    __tablename__ = "boards"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), default="Доска")
    kind: Mapped[str] = mapped_column(String(40), default="personal")  # personal | backend_queue | qcc | founder
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id", ondelete="CASCADE"), nullable=True)

    columns: Mapped[list["BoardColumn"]] = relationship(
        back_populates="board", cascade="all, delete-orphan", order_by="BoardColumn.position"
    )
    tasks: Mapped[list["Task"]] = relationship(back_populates="board", cascade="all, delete-orphan")


class BoardColumn(Base):
    __tablename__ = "board_columns"

    id: Mapped[int] = mapped_column(primary_key=True)
    board_id: Mapped[int] = mapped_column(ForeignKey("boards.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    color: Mapped[str] = mapped_column(String(20), default="#767586")
    position: Mapped[int] = mapped_column(Integer, default=0)
    is_done: Mapped[bool] = mapped_column(Boolean, default=False)  # столбец "Готово" — ставит completed_at

    board: Mapped["Board"] = relationship(back_populates="columns")


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    tag: Mapped[str] = mapped_column(String(60), default="Задача")  # free-text editable tag
    tag_color: Mapped[str] = mapped_column(String(20), default="indigo")
    priority: Mapped[Priority] = mapped_column(Enum(Priority), default=Priority.med)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    completed_at: Mapped[date | None] = mapped_column(Date, nullable=True)  # автозаполнение при "Готово"
    position: Mapped[int] = mapped_column(Integer, default=0)

    board_id: Mapped[int] = mapped_column(ForeignKey("boards.id", ondelete="CASCADE"))
    column_id: Mapped[int | None] = mapped_column(ForeignKey("board_columns.id", ondelete="SET NULL"), nullable=True)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # backend queue specific
    requester_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    assignee_ids: Mapped[list | None] = mapped_column(JSON, default=list)  # multiple backend assignees
    task_type: Mapped[str] = mapped_column(String(80), default="")

    lead_id: Mapped[int | None] = mapped_column(ForeignKey("leads.id", ondelete="SET NULL"), nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    board: Mapped["Board"] = relationship(back_populates="tasks")
    column: Mapped["BoardColumn"] = relationship()
    owner: Mapped["User"] = relationship(back_populates="tasks", foreign_keys=[owner_id])
    requester: Mapped["User"] = relationship(foreign_keys=[requester_id])


class SalesRecord(Base):
    """Дневник отдела продаж: одна запись = сотрудник + дата + метрики."""
    __tablename__ = "sales_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    record_date: Mapped[date] = mapped_column(Date, default=date.today)
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)  # {"касания": 50, "дозвоны": 30, ...}
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship()


class MarketingRecord(Base):
    """Маркетинг: недельная планировка по колонкам."""
    __tablename__ = "marketing_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    record_date: Mapped[date] = mapped_column(Date, default=date.today)
    fields: Mapped[dict] = mapped_column(JSON, default=dict)  # {"идея": "...", "сценарий": "...", ...}
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship()


class ColumnDef(Base):
    """Определения колонок для табличных отделов (продажи, маркетинг) — редактируемые."""
    __tablename__ = "column_defs"

    id: Mapped[int] = mapped_column(primary_key=True)
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id", ondelete="CASCADE"))
    key: Mapped[str] = mapped_column(String(80), nullable=False)   # internal key
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), default="number")  # number | text
    position: Mapped[int] = mapped_column(Integer, default=0)


class BugStatus(str, enum.Enum):
    new         = "new"
    in_progress = "in_progress"
    resolved    = "resolved"


class BugReport(Base):
    __tablename__ = "bug_reports"

    id:          Mapped[int]           = mapped_column(primary_key=True)
    reporter_id: Mapped[int | None]    = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    title:       Mapped[str]           = mapped_column(String(300), nullable=False)
    description: Mapped[str]           = mapped_column(Text, default="")
    status:      Mapped[BugStatus]     = mapped_column(Enum(BugStatus), default=BugStatus.new)
    priority:    Mapped[str]           = mapped_column(String(20), default="medium")  # low | medium | high | critical
    created_at:  Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())

    reporter: Mapped["User"] = relationship()


# ───────────────────────── CRM Lookups ─────────────────────────

class LeadSource(Base):
    __tablename__ = "lead_sources"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    position: Mapped[int] = mapped_column(Integer, default=0)


class Service(Base):
    __tablename__ = "services"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    position: Mapped[int] = mapped_column(Integer, default=0)


class LeadStage(Base):
    __tablename__ = "lead_stages"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0)
    norm_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_won: Mapped[bool] = mapped_column(Boolean, default=False)
    is_lost: Mapped[bool] = mapped_column(Boolean, default=False)
    color: Mapped[str] = mapped_column(String(30), default="#4648d4")


class RejectReason(Base):
    __tablename__ = "reject_reasons"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    position: Mapped[int] = mapped_column(Integer, default=0)


class ExpenseCategory(Base):
    __tablename__ = "expense_categories"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    position: Mapped[int] = mapped_column(Integer, default=0)


class Account(Base):
    __tablename__ = "accounts"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    currency: Mapped[str] = mapped_column(String(20), default="сом")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    position: Mapped[int] = mapped_column(Integer, default=0)


# ───────────────────────── Lead ─────────────────────────

class LeadStatus(str, enum.Enum):
    active = "active"
    archived = "archived"


class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_name: Mapped[str] = mapped_column(String(200), nullable=False)
    company_name: Mapped[str] = mapped_column(String(200), default="")
    phone: Mapped[str] = mapped_column(String(50), default="", index=True)
    whatsapp: Mapped[str] = mapped_column(String(50), default="")
    instagram: Mapped[str] = mapped_column(String(100), default="")
    email: Mapped[str] = mapped_column(String(255), default="")
    address: Mapped[str] = mapped_column(String(300), default="")
    website: Mapped[str] = mapped_column(String(300), default="")
    industry: Mapped[str] = mapped_column(String(120), default="")
    employees_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    source_id: Mapped[int | None] = mapped_column(ForeignKey("lead_sources.id", ondelete="SET NULL"), nullable=True, index=True)
    service_id: Mapped[int | None] = mapped_column(ForeignKey("services.id", ondelete="SET NULL"), nullable=True, index=True)
    stage_id: Mapped[int | None] = mapped_column(ForeignKey("lead_stages.id", ondelete="SET NULL"), nullable=True, index=True)
    setter_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    closer_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    potential_amount: Mapped[int] = mapped_column(Integer, default=0)
    actual_amount: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[LeadStatus] = mapped_column(Enum(LeadStatus), default=LeadStatus.active)

    next_action_type: Mapped[str] = mapped_column(String(80), default="")
    next_action_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    comment: Mapped[str] = mapped_column(Text, default="")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    reject_reason_id: Mapped[int | None] = mapped_column(ForeignKey("reject_reasons.id", ondelete="SET NULL"), nullable=True, index=True)
    reject_comment: Mapped[str] = mapped_column(Text, default="")

    source: Mapped["LeadSource"] = relationship()
    service: Mapped["Service"] = relationship()
    stage: Mapped["LeadStage"] = relationship()
    setter: Mapped["User"] = relationship(foreign_keys=[setter_id])
    closer: Mapped["User"] = relationship(foreign_keys=[closer_id])
    reject_reason: Mapped["RejectReason | None"] = relationship(foreign_keys=[reject_reason_id])


class LeadStageHistory(Base):
    __tablename__ = "lead_stage_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id", ondelete="CASCADE"), index=True)
    from_stage_id: Mapped[int | None] = mapped_column(ForeignKey("lead_stages.id", ondelete="SET NULL"), nullable=True)
    to_stage_id: Mapped[int | None] = mapped_column(ForeignKey("lead_stages.id", ondelete="SET NULL"), nullable=True)
    changed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    comment: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LeadActivity(Base):
    __tablename__ = "lead_activities"

    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id", ondelete="CASCADE"), index=True)
    activity_type: Mapped[str] = mapped_column(String(80), default="")
    channel: Mapped[str] = mapped_column(String(80), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    responsible_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    responsible: Mapped["User"] = relationship(foreign_keys=[responsible_id])


class LeadFile(Base):
    __tablename__ = "lead_files"

    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
    file_type: Mapped[str] = mapped_column(String(40), default="")
    uploaded_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    uploader: Mapped["User"] = relationship(foreign_keys=[uploaded_by])


# ─────────────────────────────────────────────────────────────────

class MeetingStatus(str, enum.Enum):
    scheduled  = "scheduled"   # запланирована
    closed     = "closed"      # Закрыт
    minus      = "minus"       # Минус
    push       = "push"        # Дожим
    rescheduled = "rescheduled" # Перенёс


class Meeting(Base):
    """Встреча — назначается сеттером, проводится клоузером."""
    __tablename__ = "meetings"

    id:            Mapped[int]            = mapped_column(primary_key=True)
    closer_id:     Mapped[int | None]     = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    setter_id:     Mapped[int | None]     = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    meeting_date:  Mapped[datetime]       = mapped_column(DateTime(timezone=True), nullable=False)
    address:       Mapped[str]            = mapped_column(String(300), default="")
    client_name:   Mapped[str]            = mapped_column(String(200), nullable=False)
    client_phone:  Mapped[str]            = mapped_column(String(50), default="")
    status:        Mapped[MeetingStatus]  = mapped_column(Enum(MeetingStatus), default=MeetingStatus.scheduled)
    notes:         Mapped[str]            = mapped_column(Text, default="")
    parent_id:     Mapped[int | None]     = mapped_column(ForeignKey("meetings.id", ondelete="SET NULL"), nullable=True)
    lead_id:       Mapped[int | None]     = mapped_column(ForeignKey("leads.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at:    Mapped[datetime]       = mapped_column(DateTime(timezone=True), server_default=func.now())

    closer:    Mapped["User"]         = relationship(foreign_keys=[closer_id])
    setter:    Mapped["User"]         = relationship(foreign_keys=[setter_id])
    sub_meetings: Mapped[list["Meeting"]] = relationship(
        foreign_keys=[parent_id], back_populates="parent", cascade="all, delete-orphan"
    )
    parent: Mapped["Meeting | None"]  = relationship(
        foreign_keys=[parent_id], back_populates="sub_meetings", remote_side="Meeting.id"
    )


class Deal(Base):
    """Сделка — финансовые данные лида."""
    __tablename__ = "deals"

    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True)
    amount: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    paid_amount: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    payment_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    payment_method: Mapped[str] = mapped_column(String(120), default="")
    status: Mapped[str] = mapped_column(String(30), default="pending")  # pending | paid
    setter_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    closer_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    deal_type: Mapped[str] = mapped_column(String(40), default="")  # from_setter | closer_self
    contract_sent_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    expected_payment_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    responsible_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    setter_commission: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    closer_commission: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    setter: Mapped["User"] = relationship(foreign_keys=[setter_id])
    closer: Mapped["User"] = relationship(foreign_keys=[closer_id])
    responsible: Mapped["User | None"] = relationship(foreign_keys=[responsible_id])


# ───────────────────────── Finance ─────────────────────────


class FinanceTransaction(Base):
    __tablename__ = "finance_transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String(20), nullable=False)       # income | expense
    category: Mapped[str | None] = mapped_column(String(120), nullable=True)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    related_lead_id: Mapped[int | None] = mapped_column(ForeignKey("leads.id", ondelete="SET NULL"), nullable=True, index=True)
    related_deal_id: Mapped[int | None] = mapped_column(ForeignKey("deals.id", ondelete="SET NULL"), nullable=True, index=True)
    account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True, index=True)
    responsible_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    payment_method: Mapped[str] = mapped_column(String(120), default="")
    comment: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    responsible: Mapped["User | None"] = relationship(foreign_keys=[responsible_id])


class PayrollRule(Base):
    __tablename__ = "payroll_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    base_salary: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    commission_percent: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    commission_condition: Mapped[str] = mapped_column(String(30), default="none", nullable=False)
    # none | from_setter | closer_self | any
    active_from: Mapped[date] = mapped_column(Date, nullable=False)
    active_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    employee: Mapped["User"] = relationship(foreign_keys=[employee_id])


class PayrollRecord(Base):
    __tablename__ = "payroll_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    base_salary: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    commission_amount: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    bonus_amount: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    penalty_amount: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_amount: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)  # draft | paid
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    employee: Mapped["User"] = relationship(foreign_keys=[employee_id])


class Debt(Base):
    __tablename__ = "debts"

    id: Mapped[int] = mapped_column(primary_key=True)
    counterparty: Mapped[str] = mapped_column(String(200), nullable=False)
    direction: Mapped[str] = mapped_column(String(20), nullable=False)   # we_owe | owed_to_us
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    created_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    comment: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AdExpense(Base):
    """Рекламные расходы в разрезе источников."""
    __tablename__ = "ad_expenses"

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    source_id: Mapped[int | None] = mapped_column(ForeignKey("lead_sources.id", ondelete="SET NULL"), nullable=True, index=True)
    ad_account: Mapped[str] = mapped_column(String(200), default="")
    campaign_name: Mapped[str] = mapped_column(String(300), default="")
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(20), default="сом")
    responsible_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    comment: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    source: Mapped["LeadSource | None"] = relationship(foreign_keys=[source_id])
    responsible: Mapped["User | None"] = relationship(foreign_keys=[responsible_id])


class AccountBalance(Base):
    __tablename__ = "account_balances"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    balance: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    account: Mapped["Account"] = relationship(foreign_keys=[account_id])


class DevPayrollConfig(Base):
    """Global editable rates for dev department salary calculation."""
    __tablename__ = "dev_payroll_configs"

    id: Mapped[int] = mapped_column(primary_key=True)
    role_kind: Mapped[str] = mapped_column(String(30), nullable=False, unique=True)  # prompter | teamlead
    new_bot_price: Mapped[int] = mapped_column(Integer, nullable=False, default=5000)
    support_price: Mapped[int] = mapped_column(Integer, nullable=False, default=1000)
    base_salary: Mapped[int] = mapped_column(Integer, nullable=False, default=20000)
    free_bots_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    key_prefix: Mapped[str] = mapped_column(String(16), nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(foreign_keys=[user_id])


from sqlalchemy import UniqueConstraint


class MonthlyPlan(Base):
    __tablename__ = "monthly_plans"
    __table_args__ = (UniqueConstraint("year", "month", name="uq_monthly_plans_year_month"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    plan_revenue: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    plan_leads: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    plan_meetings: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    plan_sales: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    plan_cpl: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    plan_cac: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    plan_expenses: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ─────────────────────────── NevoLabs ───────────────────────────

class LabProject(Base):
    __tablename__ = "lab_projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    # Идея | В разработке | Запущен | Заморожен
    status: Mapped[str] = mapped_column(String(40), default="Идея", nullable=False)
    board_id: Mapped[int | None] = mapped_column(ForeignKey("boards.id", ondelete="SET NULL"), nullable=True, index=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    board: Mapped["Board | None"] = relationship()
    creator: Mapped["User | None"] = relationship(foreign_keys=[created_by])
    members: Mapped[list["LabProjectMember"]] = relationship(back_populates="project", cascade="all, delete-orphan")


class LabProjectMember(Base):
    __tablename__ = "lab_project_members"

    id: Mapped[int] = mapped_column(primary_key=True)
    lab_project_id: Mapped[int] = mapped_column(ForeignKey("lab_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    project: Mapped["LabProject"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship()
