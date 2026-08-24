"""Settings router: CRUD for CRM lookup tables."""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_admin
from app.models import (
    LeadSource, Service, LeadStage, RejectReason, ExpenseCategory, Account, User,
)

router = APIRouter(prefix="/api/settings", tags=["settings"])


# ── Pydantic schemas ──────────────────────────────────────────────

class LookupCreate(BaseModel):
    name: str

class LookupUpdate(BaseModel):
    name: str | None = None
    is_active: bool | None = None
    position: int | None = None

class StageCreate(BaseModel):
    name: str
    norm_days: int | None = None
    is_won: bool = False
    is_lost: bool = False
    color: str = "#4648d4"

class StageUpdate(BaseModel):
    name: str | None = None
    norm_days: int | None = None
    is_won: bool | None = None
    is_lost: bool | None = None
    color: str | None = None
    position: int | None = None
    # Archiving replaces deletion: leads and history keep referencing the stage.
    is_archived: bool | None = None

class AccountCreate(BaseModel):
    name: str
    currency: str = "сом"

class AccountUpdate(BaseModel):
    name: str | None = None
    currency: str | None = None
    is_active: bool | None = None
    position: int | None = None


# ── Generic helpers ───────────────────────────────────────────────

def _serialize(obj: Any) -> dict:
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


def _reorder(db: Session, model, record_id: int, new_position: int) -> list:
    items = db.query(model).order_by(model.position).all()
    item = next((i for i in items if i.id == record_id), None)
    if not item:
        raise HTTPException(404, "Not found")
    items.remove(item)
    new_position = max(0, min(new_position, len(items)))
    items.insert(new_position, item)
    for idx, i in enumerate(items):
        i.position = idx
    db.commit()
    return [_serialize(i) for i in items]


# ── Lead Sources ──────────────────────────────────────────────────

@router.get("/sources")
def list_sources(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return [_serialize(r) for r in db.query(LeadSource).order_by(LeadSource.position).all()]

@router.post("/sources", status_code=201)
def create_source(body: LookupCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    max_pos = db.query(LeadSource).count()
    r = LeadSource(name=body.name, position=max_pos)
    db.add(r); db.commit(); db.refresh(r)
    return _serialize(r)

@router.patch("/sources/{id}")
def update_source(id: int, body: LookupUpdate, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = db.get(LeadSource, id)
    if not r: raise HTTPException(404, "Not found")
    if body.name is not None: r.name = body.name
    if body.is_active is not None: r.is_active = body.is_active
    if body.position is not None: r.position = body.position
    db.commit(); db.refresh(r)
    return _serialize(r)

@router.post("/sources/{id}/reorder")
def reorder_source(id: int, new_position: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    return _reorder(db, LeadSource, id, new_position)


# ── Services ──────────────────────────────────────────────────────

@router.get("/services")
def list_services(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return [_serialize(r) for r in db.query(Service).order_by(Service.position).all()]

@router.post("/services", status_code=201)
def create_service(body: LookupCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    max_pos = db.query(Service).count()
    r = Service(name=body.name, position=max_pos)
    db.add(r); db.commit(); db.refresh(r)
    return _serialize(r)

@router.patch("/services/{id}")
def update_service(id: int, body: LookupUpdate, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = db.get(Service, id)
    if not r: raise HTTPException(404, "Not found")
    if body.name is not None: r.name = body.name
    if body.is_active is not None: r.is_active = body.is_active
    if body.position is not None: r.position = body.position
    db.commit(); db.refresh(r)
    return _serialize(r)

@router.post("/services/{id}/reorder")
def reorder_service(id: int, new_position: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    return _reorder(db, Service, id, new_position)


# ── Lead Stages ───────────────────────────────────────────────────

@router.get("/stages")
def list_stages(
    include_archived: bool = False,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """Active stages by default.

    Archived stages are excluded from every picker, form and funnel column; pass
    `include_archived=true` (settings screens, history rendering) to see them.
    """
    q = db.query(LeadStage)
    if not include_archived:
        q = q.filter(LeadStage.is_archived == False)  # noqa: E712
    return [_serialize(r) for r in q.order_by(LeadStage.position).all()]

@router.post("/stages", status_code=201)
def create_stage(body: StageCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    max_pos = db.query(LeadStage).count()
    r = LeadStage(name=body.name, position=max_pos,
                  norm_days=body.norm_days, is_won=body.is_won,
                  is_lost=body.is_lost, color=body.color)
    db.add(r); db.commit(); db.refresh(r)
    return _serialize(r)

@router.patch("/stages/{id}")
def update_stage(id: int, body: StageUpdate, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = db.get(LeadStage, id)
    if not r: raise HTTPException(404, "Not found")
    for field in ("name", "norm_days", "is_won", "is_lost", "color", "position", "is_archived"):
        val = getattr(body, field)
        if val is not None:
            setattr(r, field, val)
    db.commit(); db.refresh(r)
    return _serialize(r)

@router.post("/stages/{id}/archive")
def archive_stage(id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    """Retire a stage without deleting it.

    Leads still sitting on it are moved to the first active non-final stage, and
    each move is recorded in the lead's history so the trail stays readable.
    """
    from app.models import Lead, LeadStageHistory

    stage = db.get(LeadStage, id)
    if not stage:
        raise HTTPException(404, "Not found")
    if stage.is_archived:
        return _serialize(stage)

    target = (
        db.query(LeadStage)
        .filter(
            LeadStage.id != id,
            LeadStage.is_archived == False,  # noqa: E712
            LeadStage.is_won == False,       # noqa: E712
            LeadStage.is_lost == False,      # noqa: E712
        )
        .order_by(LeadStage.position)
        .first()
    )
    if target is None:
        raise HTTPException(422, "Нет активного этапа, куда перенести лиды")

    for lead in db.query(Lead).filter(Lead.stage_id == id).all():
        db.add(LeadStageHistory(
            lead_id=lead.id, from_stage_id=id, to_stage_id=target.id,
            changed_by=None,
            comment=f"Системный перенос: этап «{stage.name}» архивирован",
        ))
        lead.stage_id = target.id

    stage.is_archived = True
    db.commit()
    db.refresh(stage)
    return _serialize(stage)

@router.post("/stages/{id}/reorder")
def reorder_stage(id: int, new_position: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    return _reorder(db, LeadStage, id, new_position)


# ── Reject Reasons ────────────────────────────────────────────────

@router.get("/reject-reasons")
def list_reject_reasons(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return [_serialize(r) for r in db.query(RejectReason).order_by(RejectReason.position).all()]

@router.post("/reject-reasons", status_code=201)
def create_reject_reason(body: LookupCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    max_pos = db.query(RejectReason).count()
    r = RejectReason(name=body.name, position=max_pos)
    db.add(r); db.commit(); db.refresh(r)
    return _serialize(r)

@router.patch("/reject-reasons/{id}")
def update_reject_reason(id: int, body: LookupUpdate, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = db.get(RejectReason, id)
    if not r: raise HTTPException(404, "Not found")
    if body.name is not None: r.name = body.name
    if body.is_active is not None: r.is_active = body.is_active
    if body.position is not None: r.position = body.position
    db.commit(); db.refresh(r)
    return _serialize(r)

@router.post("/reject-reasons/{id}/reorder")
def reorder_reject_reason(id: int, new_position: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    return _reorder(db, RejectReason, id, new_position)


# ── Expense Categories ────────────────────────────────────────────

@router.get("/expense-categories")
def list_expense_categories(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return [_serialize(r) for r in db.query(ExpenseCategory).order_by(ExpenseCategory.position).all()]

@router.post("/expense-categories", status_code=201)
def create_expense_category(body: LookupCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    max_pos = db.query(ExpenseCategory).count()
    r = ExpenseCategory(name=body.name, position=max_pos)
    db.add(r); db.commit(); db.refresh(r)
    return _serialize(r)

@router.patch("/expense-categories/{id}")
def update_expense_category(id: int, body: LookupUpdate, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = db.get(ExpenseCategory, id)
    if not r: raise HTTPException(404, "Not found")
    if body.name is not None: r.name = body.name
    if body.is_active is not None: r.is_active = body.is_active
    if body.position is not None: r.position = body.position
    db.commit(); db.refresh(r)
    return _serialize(r)

@router.post("/expense-categories/{id}/reorder")
def reorder_expense_category(id: int, new_position: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    return _reorder(db, ExpenseCategory, id, new_position)


# ── Accounts ──────────────────────────────────────────────────────

@router.get("/accounts")
def list_accounts(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return [_serialize(r) for r in db.query(Account).order_by(Account.position).all()]

@router.post("/accounts", status_code=201)
def create_account(body: AccountCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    max_pos = db.query(Account).count()
    r = Account(name=body.name, currency=body.currency, position=max_pos)
    db.add(r); db.commit(); db.refresh(r)
    return _serialize(r)

@router.patch("/accounts/{id}")
def update_account(id: int, body: AccountUpdate, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = db.get(Account, id)
    if not r: raise HTTPException(404, "Not found")
    for field in ("name", "currency", "is_active", "position"):
        val = getattr(body, field)
        if val is not None:
            setattr(r, field, val)
    db.commit(); db.refresh(r)
    return _serialize(r)

@router.post("/accounts/{id}/reorder")
def reorder_account(id: int, new_position: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    return _reorder(db, Account, id, new_position)
