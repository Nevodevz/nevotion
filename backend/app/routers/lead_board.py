"""Shared sales Kanban layout, independent of CRM stages and finance."""
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_admin
from app.models import Lead, LeadBoardColumn, LeadBoardPlacement, LeadStatus, User
from app.routers.leads import LeadOut, _apply_list_filters, _deals_by_lead, _eager_lead, _lead_out

router = APIRouter(prefix="/api/lead-board", tags=["lead-board"])


class ColumnCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    color: str = Field(default="#4648d4", pattern=r"^#[0-9a-fA-F]{6}$")

    @field_validator("name")
    @classmethod
    def trim_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Укажите название столбца")
        return value.strip()


class ColumnUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")

    @field_validator("name")
    @classmethod
    def trim_name(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("Укажите название столбца")
        return value.strip() if value is not None else None


class ColumnOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    color: str
    position: int


class CardOut(LeadOut):
    board_column_id: int | None
    board_position: int


class BoardOut(BaseModel):
    columns: list[ColumnOut]
    leads: list[CardOut]


class MoveCard(BaseModel):
    column_id: int | None
    before_lead_id: int | None = None
    expected_column_id: int | None = None


class MoveColumn(BaseModel):
    before_column_id: int | None = None


def _lock_board(db: Session) -> None:
    # One shared board: serialize ordering changes across workers on PostgreSQL.
    if db.get_bind().dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(810021, 1)"))


def _column(db: Session, column_id: int) -> LeadBoardColumn:
    column = db.get(LeadBoardColumn, column_id)
    if column is None:
        raise HTTPException(404, "Столбец не найден")
    return column


def _present(db: Session, lead: Lead, placement: LeadBoardPlacement | None, deal=None) -> CardOut:
    return CardOut(
        **_lead_out(db, lead, deal).model_dump(),
        board_column_id=placement.column_id if placement else None,
        board_position=placement.position if placement else 0,
    )


@router.get("", response_model=BoardOut)
def get_board(
    search: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    source_id: int | None = None,
    service_id: int | None = None,
    stage_id: int | None = None,
    setter_id: int | None = None,
    closer_id: int | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = _eager_lead(db).outerjoin(LeadBoardPlacement, LeadBoardPlacement.lead_id == Lead.id).add_entity(LeadBoardPlacement)
    query = _apply_list_filters(
        query, source_id=source_id, service_id=service_id, stage_id=stage_id,
        setter_id=setter_id, closer_id=closer_id, search=search,
        date_from=date_from.isoformat() if date_from else None,
        date_to=date_to.isoformat() if date_to else None,
    ).filter(Lead.status == LeadStatus.active)
    rows = query.order_by(func.coalesce(LeadBoardPlacement.position, 0), Lead.created_at.desc(), Lead.id.desc()).all()
    deals = _deals_by_lead(db, [lead.id for lead, _placement in rows])
    return BoardOut(
        columns=db.query(LeadBoardColumn).order_by(LeadBoardColumn.position, LeadBoardColumn.id).all(),
        leads=[_present(db, lead, placement, deals.get(lead.id)) for lead, placement in rows],
    )


@router.post("/columns", response_model=ColumnOut, status_code=201)
def create_column(body: ColumnCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    _lock_board(db)
    last = db.query(func.max(LeadBoardColumn.position)).scalar()
    column = LeadBoardColumn(name=body.name, color=body.color, position=(last + 1) if last is not None else 0)
    db.add(column)
    db.commit()
    db.refresh(column)
    return column


@router.patch("/columns/{column_id}", response_model=ColumnOut)
def update_column(column_id: int, body: ColumnUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    _lock_board(db)
    column = _column(db, column_id)
    values = body.model_dump(exclude_none=True)
    if not values:
        raise HTTPException(422, "Укажите название или цвет столбца")
    for key, value in values.items():
        setattr(column, key, value)
    db.commit()
    db.refresh(column)
    return column


@router.post("/columns/{column_id}/move", response_model=list[ColumnOut])
def move_column(column_id: int, body: MoveColumn, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    _lock_board(db)
    column = _column(db, column_id)
    if body.before_column_id == column_id:
        return db.query(LeadBoardColumn).order_by(LeadBoardColumn.position, LeadBoardColumn.id).all()
    columns = db.query(LeadBoardColumn).filter(LeadBoardColumn.id != column_id).order_by(LeadBoardColumn.position, LeadBoardColumn.id).all()
    ids = [item.id for item in columns]
    if body.before_column_id is not None and body.before_column_id not in ids:
        raise HTTPException(404, "Целевой столбец не найден")
    index = ids.index(body.before_column_id) if body.before_column_id is not None else len(columns)
    columns.insert(index, column)
    for position, item in enumerate(columns):
        item.position = position
    db.commit()
    return columns


@router.delete("/columns/{column_id}", status_code=204)
def delete_column(column_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    _lock_board(db)
    column = _column(db, column_id)
    # Retain every lead and its CRM state; only its board placement is reset.
    db.query(LeadBoardPlacement).filter(LeadBoardPlacement.column_id == column_id).update(
        {LeadBoardPlacement.column_id: None, LeadBoardPlacement.position: 0}, synchronize_session=False,
    )
    db.delete(column)
    db.commit()


@router.patch("/leads/{lead_id}/move", response_model=CardOut)
def move_card(lead_id: int, body: MoveCard, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _lock_board(db)
    lead = _eager_lead(db).filter(Lead.id == lead_id).first()
    if lead is None:
        raise HTTPException(404, "Лид не найден")
    if lead.status != LeadStatus.active:
        raise HTTPException(422, "Архивный лид нельзя перемещать")
    if body.column_id is not None:
        _column(db, body.column_id)
    placement = db.get(LeadBoardPlacement, lead_id)
    current_column = placement.column_id if placement else None
    if "expected_column_id" in body.model_fields_set and body.expected_column_id != current_column:
        raise HTTPException(409, "Лид уже перемещён другим пользователем. Обновите доску")
    if body.before_lead_id == lead_id:
        raise HTTPException(422, "Нельзя поместить карточку перед самой собой")
    query = db.query(Lead.id).outerjoin(LeadBoardPlacement, LeadBoardPlacement.lead_id == Lead.id).filter(
        Lead.status == LeadStatus.active, Lead.id != lead_id,
        LeadBoardPlacement.column_id.is_(None) if body.column_id is None else LeadBoardPlacement.column_id == body.column_id,
    )
    ids = [row[0] for row in query.order_by(func.coalesce(LeadBoardPlacement.position, 0), Lead.created_at.desc(), Lead.id.desc()).all()]
    if body.before_lead_id is not None and body.before_lead_id not in ids:
        raise HTTPException(422, "Целевая карточка больше не находится в этом столбце. Обновите доску")
    index = ids.index(body.before_lead_id) if body.before_lead_id is not None else len(ids)
    ids.insert(index, lead_id)
    placements = {item.lead_id: item for item in db.query(LeadBoardPlacement).filter(LeadBoardPlacement.lead_id.in_(ids)).all()}
    for position, item_id in enumerate(ids):
        item = placements.get(item_id)
        if item is None:
            item = LeadBoardPlacement(lead_id=item_id)
            db.add(item)
        item.column_id = body.column_id
        item.position = position
        if item_id == lead_id:
            item.updated_by = user.id
            item.updated_at = datetime.now(timezone.utc)
            placement = item
    db.commit()
    deal = _deals_by_lead(db, [lead_id]).get(lead_id)
    return _present(db, lead, placement, deal)
