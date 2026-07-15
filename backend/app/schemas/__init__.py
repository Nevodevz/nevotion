from datetime import date, datetime
from typing import Optional, Any

from pydantic import BaseModel, EmailStr, ConfigDict

from app.models import Role, ProjectStatus, Priority


# ---------- Auth ----------
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ---------- User ----------
class UserBase(BaseModel):
    name: str
    email: EmailStr
    position: str = "Сотрудник"
    avatar_color: str = "indigo"


class UserCreate(UserBase):
    password: str
    role: Role = Role.staff
    is_founder: bool = False
    is_active: bool = True
    department_ids: list[int] = []


class UserUpdate(BaseModel):
    name: Optional[str] = None
    position: Optional[str] = None
    role: Optional[Role] = None
    is_founder: Optional[bool] = None
    avatar_color: Optional[str] = None
    is_active: Optional[bool] = None
    last_seen: Optional[datetime] = None
    password: Optional[str] = None
    department_ids: Optional[list[int]] = None


class UserOut(UserBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    role: Role
    is_founder: bool
    is_active: bool
    last_seen: Optional[datetime] = None
    created_at: datetime


class UserWithStats(UserOut):
    total_bots: int = 0
    new_bots: int = 0
    support_bots: int = 0
    department_ids: list[int] = []
    is_online: bool = False           # computed from last_seen < 5 min
    last_seen_label: Optional[str] = None  # "5 мин назад" etc.


# ---------- Department ----------
class DepartmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    slug: str
    icon: str
    admin_only: bool
    kind: str
    content: str
    embed_url: str


class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    content: Optional[str] = None
    embed_url: Optional[str] = None


# ---------- Project ----------
class ProjectBase(BaseModel):
    company: str
    status: ProjectStatus = ProjectStatus.new
    sub_status: Optional[str] = None
    price: int = 0
    color: str = "green"
    bot_comment: str = ""
    connected_at: Optional[date] = None
    delivered_at: Optional[date] = None
    notes: str = ""
    owner_id: Optional[int] = None
    lead_id: Optional[int] = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    company: Optional[str] = None
    status: Optional[ProjectStatus] = None
    sub_status: Optional[str] = None
    price: Optional[int] = None
    color: Optional[str] = None
    bot_comment: Optional[str] = None
    connected_at: Optional[date] = None
    delivered_at: Optional[date] = None
    notes: Optional[str] = None
    owner_id: Optional[int] = None
    lead_id: Optional[int] = None


class ProjectOut(ProjectBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    owner: Optional[UserOut] = None
    created_at: datetime


# ---------- Board / Column / Task ----------
class BoardColumnOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    color: str
    position: int
    is_done: bool


class BoardColumnCreate(BaseModel):
    name: str
    color: str = "#767586"
    is_done: bool = False


class BoardColumnUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    position: Optional[int] = None
    is_done: Optional[bool] = None


class TaskBase(BaseModel):
    title: str
    description: str = ""
    tag: str = "Задача"
    tag_color: str = "indigo"
    priority: Priority = Priority.med
    due_date: Optional[date] = None
    column_id: Optional[int] = None
    owner_id: Optional[int] = None
    # backend queue
    requester_id: Optional[int] = None
    assignee_ids: list[int] = []
    task_type: str = ""


class TaskCreate(TaskBase):
    board_id: int


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    tag: Optional[str] = None
    tag_color: Optional[str] = None
    priority: Optional[Priority] = None
    due_date: Optional[date] = None
    column_id: Optional[int] = None
    owner_id: Optional[int] = None
    position: Optional[int] = None
    requester_id: Optional[int] = None
    assignee_ids: Optional[list[int]] = None
    task_type: Optional[str] = None


class TaskMove(BaseModel):
    column_id: int
    position: int = 0


class TaskOut(TaskBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    board_id: int
    position: int
    completed_at: Optional[date] = None
    owner: Optional[UserOut] = None
    requester: Optional[UserOut] = None
    created_at: datetime


class BoardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    kind: str
    owner_id: Optional[int] = None
    department_id: Optional[int] = None
    columns: list[BoardColumnOut] = []


# ---------- Sales ----------
class ColumnDefOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    key: str
    label: str
    kind: str
    position: int


class ColumnDefCreate(BaseModel):
    label: str
    kind: str = "number"


class SalesRecordCreate(BaseModel):
    user_id: Optional[int] = None
    record_date: date
    metrics: dict[str, Any] = {}


class SalesRecordUpdate(BaseModel):
    record_date: Optional[date] = None
    metrics: Optional[dict[str, Any]] = None


class SalesRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: Optional[int]
    record_date: date
    metrics: dict[str, Any]
    user: Optional[UserOut] = None


# ---------- AdExpense ----------
class AdExpenseCreate(BaseModel):
    date: date
    source_id: Optional[int] = None
    ad_account: str = ""
    campaign_name: str = ""
    amount: int
    currency: str = "сом"
    responsible_id: Optional[int] = None
    comment: str = ""


class AdExpenseUpdate(BaseModel):
    date: Optional[date] = None
    source_id: Optional[int] = None
    ad_account: Optional[str] = None
    campaign_name: Optional[str] = None
    amount: Optional[int] = None
    currency: Optional[str] = None
    responsible_id: Optional[int] = None
    comment: Optional[str] = None


class AdExpenseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    date: date
    source_id: Optional[int]
    ad_account: str
    campaign_name: str
    amount: int
    currency: str
    responsible_id: Optional[int]
    comment: str
    created_at: datetime
    source: Optional[Any] = None
    responsible: Optional[Any] = None


# ---------- Marketing ----------
class MarketingRecordCreate(BaseModel):
    user_id: Optional[int] = None
    record_date: date
    fields: dict[str, Any] = {}


class MarketingRecordUpdate(BaseModel):
    record_date: Optional[date] = None
    fields: Optional[dict[str, Any]] = None


class MarketingRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: Optional[int]
    record_date: date
    fields: dict[str, Any]
    user: Optional[UserOut] = None


# ---------- LabProject ----------

class LabProjectMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    lab_project_id: int
    user_id: int
    user: Optional[UserOut] = None


class LabProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: str
    status: str
    board_id: Optional[int] = None
    is_archived: bool
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    members: list[LabProjectMemberOut] = []
    creator: Optional[UserOut] = None
    user_can_manage: bool = False


class LabProjectCreate(BaseModel):
    name: str
    description: str = ""
    status: str = "Идея"
    member_ids: list[int] = []


class LabProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    member_ids: Optional[list[int]] = None


class LabProjectMemberAdd(BaseModel):
    user_id: int
