from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import (
    Board, BoardColumn, Department, LabProject, LabProjectMember, Role, User,
)
from app.schemas import (
    LabProjectCreate, LabProjectMemberAdd, LabProjectOut, LabProjectUpdate,
)

router = APIRouter(prefix="/api/lab-projects", tags=["lab-projects"])

LAB_DEFAULT_COLS = [
    ("To-Do", "#767586", False),
    ("In Progress", "#4648d4", False),
    ("Done", "#16a34a", True),
]


def _nevolabs_dept(db: Session) -> Department | None:
    return db.query(Department).filter(Department.slug == "nevolabs").first()


def _is_nevolabs_member(user: User, db: Session) -> bool:
    dept = _nevolabs_dept(db)
    if not dept:
        return False
    return any(m.id == user.id for m in dept.members)


def _can_manage(user: User, db: Session) -> bool:
    return user.is_founder or user.role == Role.admin or _is_nevolabs_member(user, db)


def _can_view_project_board(user: User, project: LabProject, db: Session) -> bool:
    if user.is_founder or user.role == Role.admin:
        return True
    if _is_nevolabs_member(user, db):
        return True
    return db.query(LabProjectMember).filter(
        LabProjectMember.lab_project_id == project.id,
        LabProjectMember.user_id == user.id,
    ).first() is not None


def _load_project(project_id: int, db: Session) -> LabProject:
    proj = (
        db.query(LabProject)
        .options(
            joinedload(LabProject.members).joinedload(LabProjectMember.user),
            joinedload(LabProject.creator),
        )
        .filter(LabProject.id == project_id)
        .first()
    )
    if not proj:
        raise HTTPException(404, "Проект не найден")
    return proj


def _create_project_board(db: Session, project_name: str) -> Board:
    board = Board(name=project_name, kind="lab_project")
    db.add(board)
    db.flush()
    for i, (name, color, is_done) in enumerate(LAB_DEFAULT_COLS):
        db.add(BoardColumn(board_id=board.id, name=name, color=color, position=i, is_done=is_done))
    db.flush()
    return board


@router.get("", response_model=list[LabProjectOut])
def list_lab_projects(
    include_archived: bool = Query(False),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = (
        db.query(LabProject)
        .options(
            joinedload(LabProject.members).joinedload(LabProjectMember.user),
            joinedload(LabProject.creator),
        )
    )
    if not include_archived:
        q = q.filter(LabProject.is_archived.is_(False))
    return q.order_by(LabProject.created_at.desc()).all()


@router.get("/{project_id}", response_model=LabProjectOut)
def get_lab_project(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = _load_project(project_id, db)
    project.user_can_manage = _can_view_project_board(user, project, db)
    return project


@router.post("", response_model=LabProjectOut, status_code=201)
def create_lab_project(
    payload: LabProjectCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not _can_manage(user, db):
        raise HTTPException(403, "Доступ только для участников NevoLabs, основателей и администраторов")

    board = _create_project_board(db, payload.name)

    project = LabProject(
        name=payload.name,
        description=payload.description,
        status=payload.status,
        board_id=board.id,
        created_by=user.id,
    )
    db.add(project)
    db.flush()

    seen = set()
    for uid in payload.member_ids:
        if uid not in seen:
            db.add(LabProjectMember(lab_project_id=project.id, user_id=uid))
            seen.add(uid)

    db.commit()
    return _load_project(project.id, db)


@router.patch("/{project_id}", response_model=LabProjectOut)
def update_lab_project(
    project_id: int,
    payload: LabProjectUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not _can_manage(user, db):
        raise HTTPException(403, "Нет прав на редактирование")

    project = db.get(LabProject, project_id)
    if not project:
        raise HTTPException(404, "Проект не найден")
    if project.is_archived:
        raise HTTPException(400, "Нельзя редактировать архивный проект")

    data = payload.model_dump(exclude_unset=True)
    member_ids = data.pop("member_ids", None)

    for field, value in data.items():
        setattr(project, field, value)

    if member_ids is not None:
        db.query(LabProjectMember).filter(LabProjectMember.lab_project_id == project_id).delete()
        seen = set()
        for uid in member_ids:
            if uid not in seen:
                db.add(LabProjectMember(lab_project_id=project_id, user_id=uid))
                seen.add(uid)

    db.commit()
    return _load_project(project_id, db)


@router.post("/{project_id}/archive", response_model=LabProjectOut)
def archive_lab_project(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not _can_manage(user, db):
        raise HTTPException(403, "Нет прав на архивацию")

    project = db.get(LabProject, project_id)
    if not project:
        raise HTTPException(404, "Проект не найден")

    project.is_archived = True
    db.commit()
    return _load_project(project_id, db)


@router.post("/{project_id}/members", response_model=LabProjectOut)
def add_member(
    project_id: int,
    payload: LabProjectMemberAdd,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not _can_manage(user, db):
        raise HTTPException(403, "Нет прав")

    project = db.get(LabProject, project_id)
    if not project:
        raise HTTPException(404, "Проект не найден")

    existing = db.query(LabProjectMember).filter(
        LabProjectMember.lab_project_id == project_id,
        LabProjectMember.user_id == payload.user_id,
    ).first()
    if not existing:
        db.add(LabProjectMember(lab_project_id=project_id, user_id=payload.user_id))
        db.commit()

    return _load_project(project_id, db)


@router.delete("/{project_id}/members/{user_id}", response_model=LabProjectOut)
def remove_member(
    project_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not _can_manage(user, db):
        raise HTTPException(403, "Нет прав")

    project = db.get(LabProject, project_id)
    if not project:
        raise HTTPException(404, "Проект не найден")

    db.query(LabProjectMember).filter(
        LabProjectMember.lab_project_id == project_id,
        LabProjectMember.user_id == user_id,
    ).delete()
    db.commit()
    return _load_project(project_id, db)
