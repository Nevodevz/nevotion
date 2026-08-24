import hashlib
import secrets
from datetime import date

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session, joinedload
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.database import get_db
from app.core.deps import get_current_user, require_admin
from app.models import (
    Board, BoardColumn, BoardShare, Task, User, Role, Department, LabProject, LabProjectMember,
)
from app.schemas import (
    BoardOut, BoardColumnOut, BoardColumnCreate, BoardColumnUpdate,
    TaskOut, TaskCreate, TaskUpdate, TaskMove,
    BoardShareStatus, BoardShareCreated, PublicBoardOut,
)

router = APIRouter(prefix="/api/boards", tags=["boards"])
public_router = APIRouter(prefix="/api/public/boards", tags=["public-boards"])
limiter = Limiter(key_func=get_remote_address)


DEFAULT_COLUMNS = [
    ("To-do", "#767586", False),
    ("In progress", "#4648d4", False),
    ("Done", "#16a34a", True),
]


def ensure_personal_board(db: Session, user_id: int) -> Board:
    board = db.query(Board).filter(Board.kind == "personal", Board.owner_id == user_id).first()
    if board:
        return board
    board = Board(name="Личный трекер", kind="personal", owner_id=user_id)
    db.add(board)
    db.flush()
    for i, (name, color, is_done) in enumerate(DEFAULT_COLUMNS):
        db.add(BoardColumn(board_id=board.id, name=name, color=color, position=i, is_done=is_done))
    db.commit()
    db.refresh(board)
    return board


def _can_edit_board(user: User, board: Board, db: Session | None = None) -> bool:
    """Personal board: owner or admin. Shared boards (backend_queue, qcc, founder): broader rules."""
    if not _can_view_board(user, board, db):
        return False
    if user.role == Role.admin:
        return True
    if board.kind == "personal":
        return board.owner_id == user.id
    if board.kind in ("backend_queue", "qcc", "lab_project"):
        return True  # view == edit for these kinds
    if board.kind == "founder":
        return user.is_founder
    return False


def _can_view_board(user: User, board: Board, db: Session | None = None) -> bool:
    """Check board visibility. Respects founder-only boards and admin_only departments."""
    if board.kind == "founder":
        return user.is_founder
    if board.kind == "lab_project":
        lab_proj = None
        if db is not None:
            lab_proj = db.query(LabProject).filter(LabProject.board_id == board.id).first()
            # Archiving is the domain-level delete operation for NevoLabs.
            # Its board remains in the database for recovery, but disappears
            # from normal board discovery and cannot be opened directly.
            if lab_proj and lab_proj.is_archived:
                return False
        if db is None:
            return user.is_founder or user.role == Role.admin
        if user.is_founder or user.role == Role.admin:
            return True
        nevolabs = db.query(Department).filter(Department.slug == "nevolabs").first()
        if nevolabs and any(m.id == user.id for m in nevolabs.members):
            return True
        if lab_proj:
            return db.query(LabProjectMember).filter(
                LabProjectMember.lab_project_id == lab_proj.id,
                LabProjectMember.user_id == user.id,
            ).first() is not None
        return False
    if board.department_id and db is not None:
        dept = db.get(Department, board.department_id)
        if dept and dept.admin_only and not user.is_founder:
            return False
    return True


# ---------- Boards ----------
@router.get("", response_model=list[BoardOut])
def list_boards(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Return every board the current user can see.

    This is the canonical discovery endpoint for UI and MCP clients.  Older
    clients may keep using the personal/department endpoints.
    """
    boards = db.query(Board).order_by(Board.name, Board.id).all()
    return [board for board in boards if _can_view_board(user, board, db)]


@router.get("/personal/{user_id}", response_model=BoardOut)
def get_personal_board(user_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return ensure_personal_board(db, user_id)


@router.get("/by-department/{dept_id}", response_model=list[BoardOut])
def boards_for_department(dept_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    boards = db.query(Board).filter(Board.department_id == dept_id).all()
    return [b for b in boards if _can_view_board(user, b, db)]


@router.get("/{board_id}", response_model=BoardOut)
def get_board(board_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    board = db.get(Board, board_id)
    if not board:
        raise HTTPException(404, "Доска не найдена")
    if not _can_view_board(user, board, db):
        raise HTTPException(403, "Нет доступа")
    return board


# ---------- Public read-only sharing ----------
def _share_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _active_share(db: Session, board_id: int) -> BoardShare | None:
    return (
        db.query(BoardShare)
        .filter(BoardShare.board_id == board_id, BoardShare.revoked == False)
        .order_by(BoardShare.created_at.desc(), BoardShare.id.desc())
        .first()
    )


def _shareable_board(db: Session, board_id: int, user: User) -> Board:
    board = db.get(Board, board_id)
    if not board:
        raise HTTPException(404, "Доска не найдена")
    if not _can_edit_board(user, board, db):
        raise HTTPException(403, "Нет прав на публикацию доски")
    return board


@router.get("/{board_id}/share", response_model=BoardShareStatus)
def get_board_share(
    board_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _shareable_board(db, board_id, user)
    share = _active_share(db, board_id)
    if not share:
        return BoardShareStatus(active=False)
    return BoardShareStatus(
        active=True,
        token_prefix=share.token_prefix,
        created_at=share.created_at,
    )


@router.post("/{board_id}/share", response_model=BoardShareCreated, status_code=201)
def create_board_share(
    board_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Rotate a board's public link and return the new plaintext token once."""
    _shareable_board(db, board_id, user)
    db.query(BoardShare).filter(
        BoardShare.board_id == board_id,
        BoardShare.revoked == False,
    ).update({BoardShare.revoked: True}, synchronize_session=False)

    token = f"nvs_{secrets.token_urlsafe(32)}"
    share = BoardShare(
        board_id=board_id,
        token_hash=_share_hash(token),
        token_prefix=token[:12],
        created_by=user.id,
    )
    db.add(share)
    db.commit()
    db.refresh(share)
    return BoardShareCreated(
        token=token,
        public_path=f"/share/{token}",
        created_at=share.created_at,
    )


@router.delete("/{board_id}/share", status_code=204)
def revoke_board_share(
    board_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _shareable_board(db, board_id, user)
    db.query(BoardShare).filter(
        BoardShare.board_id == board_id,
        BoardShare.revoked == False,
    ).update({BoardShare.revoked: True}, synchronize_session=False)
    db.commit()


@public_router.get("/view", response_model=PublicBoardOut)
@limiter.limit("60/minute")
def public_board(
    request: Request,
    response: Response,
    token: str | None = Header(None, alias="X-Board-Share-Token"),
    db: Session = Depends(get_db),
):
    """Read-only board snapshot; authentication is the unguessable share token."""
    if not token:
        raise HTTPException(404, "Ссылка недействительна или отозвана")
    share = (
        db.query(BoardShare)
        .filter(
            BoardShare.token_hash == _share_hash(token),
            BoardShare.revoked == False,
        )
        .first()
    )
    if not share:
        raise HTTPException(404, "Ссылка недействительна или отозвана")

    board = (
        db.query(Board)
        .options(joinedload(Board.columns), joinedload(Board.tasks))
        .filter(Board.id == share.board_id)
        .first()
    )
    if not board:
        raise HTTPException(404, "Ссылка недействительна или отозвана")
    if board.kind == "lab_project":
        project = db.query(LabProject).filter(LabProject.board_id == board.id).first()
        if project and project.is_archived:
            raise HTTPException(404, "Ссылка недействительна или отозвана")

    response.headers["Cache-Control"] = "no-store"
    return PublicBoardOut(
        name=board.name,
        columns=sorted(board.columns, key=lambda column: (column.position, column.id)),
        tasks=sorted(board.tasks, key=lambda task: (task.position, task.id)),
    )


# ---------- Columns ----------
@router.post("/{board_id}/columns", response_model=BoardColumnOut, status_code=201)
def add_column(board_id: int, payload: BoardColumnCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    board = db.get(Board, board_id)
    if not board:
        raise HTTPException(404, "Доска не найдена")
    if not _can_edit_board(user, board, db):
        raise HTTPException(403, "Нет прав на изменение доски")
    maxpos = max([c.position for c in board.columns], default=-1)
    col = BoardColumn(board_id=board_id, name=payload.name, color=payload.color,
                      position=maxpos + 1, is_done=payload.is_done)
    db.add(col)
    db.commit()
    db.refresh(col)
    return col


@router.patch("/columns/{column_id}", response_model=BoardColumnOut)
def update_column(column_id: int, payload: BoardColumnUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    col = db.get(BoardColumn, column_id)
    if not col:
        raise HTTPException(404, "Колонка не найдена")
    board = db.get(Board, col.board_id)
    if not _can_edit_board(user, board, db):
        raise HTTPException(403, "Нет прав")
    for f, v in payload.model_dump(exclude_unset=True).items():
        setattr(col, f, v)
    db.commit()
    db.refresh(col)
    return col


@router.patch("/columns/{column_id}/position", response_model=BoardColumnOut)
def reorder_column(
    column_id: int,
    new_position: int = Query(..., ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    col = db.get(BoardColumn, column_id)
    if not col:
        raise HTTPException(404, "Колонка не найдена")
    board = db.get(Board, col.board_id)
    if not _can_edit_board(user, board, db):
        raise HTTPException(403, "Нет прав")

    all_cols = sorted(board.columns, key=lambda c: c.position)
    max_pos = len(all_cols) - 1
    new_position = min(new_position, max_pos)
    old_pos = col.position

    if old_pos == new_position:
        return col

    if old_pos < new_position:
        for c in all_cols:
            if old_pos < c.position <= new_position and c.id != column_id:
                c.position -= 1
    else:
        for c in all_cols:
            if new_position <= c.position < old_pos and c.id != column_id:
                c.position += 1

    col.position = new_position
    db.commit()
    db.refresh(col)
    return col


@router.delete("/columns/{column_id}", status_code=204)
def delete_column(column_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    col = db.get(BoardColumn, column_id)
    if not col:
        raise HTTPException(404, "Колонка не найдена")
    board = db.get(Board, col.board_id)
    if not _can_edit_board(user, board, db):
        raise HTTPException(403, "Нет прав")
    # move tasks in this column to the first remaining column
    remaining = [c for c in board.columns if c.id != column_id]
    if not remaining:
        raise HTTPException(400, "Нельзя удалить единственную колонку")
    target = sorted(remaining, key=lambda c: c.position)[0]
    db.query(Task).filter(Task.column_id == column_id).update({Task.column_id: target.id})
    db.delete(col)
    db.flush()
    # Re-pack positions to avoid gaps
    for i, c in enumerate(sorted(remaining, key=lambda c: c.position)):
        c.position = i
    db.commit()
