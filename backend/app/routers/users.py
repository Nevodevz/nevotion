from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user, require_admin
from app.core.security import hash_password
from app.models import User, Project, ProjectStatus, Department, Role
from app.schemas import UserOut, UserCreate, UserUpdate, UserWithStats
from app.services import media

router = APIRouter(prefix="/api/users", tags=["users"])

ONLINE_THRESHOLD_MINUTES = 5


def _is_online(user: User) -> bool:
    if not user.last_seen:
        return False
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=ONLINE_THRESHOLD_MINUTES)
    ls = user.last_seen
    if ls.tzinfo is None:
        ls = ls.replace(tzinfo=timezone.utc)
    return ls > cutoff


def _last_seen_label(user: User) -> str | None:
    if not user.last_seen:
        return None
    ls = user.last_seen
    if ls.tzinfo is None:
        ls = ls.replace(tzinfo=timezone.utc)
    diff = datetime.now(timezone.utc) - ls
    mins = int(diff.total_seconds() / 60)
    if mins < 1:
        return "только что"
    if mins < 60:
        return f"{mins} мин назад"
    hours = mins // 60
    if hours < 24:
        return f"{hours} ч назад"
    days = hours // 24
    return f"{days} дн назад"


def _stats(db: Session, user: User) -> UserWithStats:
    base = UserWithStats.model_validate(user)
    base.department_ids = [d.id for d in user.departments]
    base.is_online = _is_online(user)
    base.last_seen_label = _last_seen_label(user)

    if user.position == "Тимлид":
        prompters = db.query(User).filter(
            User.position == "Промпт-инженер", User.is_active == True
        ).all()
        ids = [p.id for p in prompters] + [user.id]
        projects = db.query(Project).filter(Project.owner_id.in_(ids)).all() if ids else []
    else:
        projects = db.query(Project).filter(Project.owner_id == user.id).all()

    base.total_bots = len(projects)
    base.new_bots = sum(1 for s in projects if s.status == ProjectStatus.new)
    base.support_bots = sum(1 for s in projects if s.status == ProjectStatus.support)
    return base


@router.get("", response_model=list[UserWithStats])
def list_users(
    department_id: Optional[int] = Query(None),
    include_archived: bool = Query(False),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(User).options(joinedload(User.departments))
    if not include_archived:
        q = q.filter(User.is_active == True)
    users = q.order_by(User.id).all()
    if department_id:
        users = [u for u in users if any(d.id == department_id for d in u.departments)]
    return [_stats(db, u) for u in users]


@router.get("/{user_id}", response_model=UserWithStats)
def get_user(user_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Сотрудник не найден")
    return _stats(db, user)


@router.post("", response_model=UserOut, status_code=201)
def create_user(payload: UserCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(400, "Email уже используется")
    user = User(
        name=payload.name, email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role, position=payload.position,
        is_founder=payload.is_founder, avatar_color=payload.avatar_color,
        is_active=True,
    )
    if payload.department_ids:
        user.departments = db.query(Department).filter(Department.id.in_(payload.department_ids)).all()
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Сотрудник не найден")

    if current.role != Role.admin:
        if current.id != user_id:
            raise HTTPException(403, "Можно редактировать только свой профиль")
        payload_data = payload.model_dump(exclude_unset=True)
        for protected in ("role", "is_founder", "department_ids", "is_active"):
            payload_data.pop(protected, None)
        payload = UserUpdate(**payload_data)

    data = payload.model_dump(exclude_unset=True)
    if "password" in data:
        pw = data.pop("password")
        if pw:
            user.password_hash = hash_password(pw)
    if "department_ids" in data:
        ids = data.pop("department_ids")
        user.departments = db.query(Department).filter(Department.id.in_(ids)).all() if ids else []
    for f, v in data.items():
        setattr(user, f, v)
    db.commit()
    db.refresh(user)
    return user


# ─────────────────────────── Avatars ───────────────────────────

def _can_manage_avatar(current: User, target_id: int) -> bool:
    """Own avatar always; other employees' avatars follow existing admin rights."""
    return current.id == target_id or current.role == Role.admin


@router.post("/{user_id}/avatar", response_model=UserOut)
async def upload_avatar(
    user_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """Upload and normalise an avatar (JPEG / PNG / WebP, max 5 MB).

    The file's real content is validated server-side — the declared
    Content-Type alone is never trusted — and the stored copy is re-encoded to a
    square WebP, which also strips metadata.
    """
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Сотрудник не найден")
    if not _can_manage_avatar(current, user_id):
        raise HTTPException(403, "Можно менять только свой аватар")

    # Read with a hard cap so an oversized upload cannot exhaust memory.
    data = await file.read(settings.MAX_AVATAR_BYTES + 1)
    if len(data) > settings.MAX_AVATAR_BYTES:
        mb = settings.MAX_AVATAR_BYTES // (1024 * 1024)
        raise HTTPException(413, f"Файл больше {mb} МБ")

    try:
        url = media.save_avatar(user_id, data, file.content_type)
    except media.InvalidImage as exc:
        raise HTTPException(422, str(exc))

    old = user.avatar_url
    user.avatar_url = url
    db.commit()
    db.refresh(user)
    # Only remove the previous file once the new one is committed.
    media.delete_avatar(old)
    return user


@router.delete("/{user_id}/avatar", response_model=UserOut)
def delete_avatar(
    user_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """Remove the photo; the UI falls back to initials + avatar_color."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Сотрудник не найден")
    if not _can_manage_avatar(current, user_id):
        raise HTTPException(403, "Можно менять только свой аватар")

    old = user.avatar_url
    user.avatar_url = ""
    db.commit()
    db.refresh(user)
    media.delete_avatar(old)
    return user


@router.post("/{user_id}/archive", response_model=UserOut)
def archive_user(user_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Archive (soft-delete) a user. All their data is preserved."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Сотрудник не найден")
    user.is_active = False
    db.commit()
    db.refresh(user)
    return user


@router.post("/{user_id}/restore", response_model=UserOut)
def restore_user(user_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Restore an archived user."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Сотрудник не найден")
    user.is_active = True
    db.commit()
    db.refresh(user)
    return user


@router.post("/{user_id}/reassign-bots", status_code=200)
def reassign_bots(
    user_id: int,
    new_owner_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Reassign all projects from one user to another."""
    new_owner = db.get(User, new_owner_id)
    if not new_owner:
        raise HTTPException(404, "Новый ответственный не найден")
    count = db.query(Project).filter(Project.owner_id == user_id).update(
        {Project.owner_id: new_owner_id}
    )
    db.commit()
    return {"reassigned": count, "to": new_owner.name}


@router.get("/{user_id}/bots-count")
def user_bots_count(user_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    count = db.query(Project).filter(Project.owner_id == user_id).count()
    return {"count": count}
