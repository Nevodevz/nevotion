from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_admin
from app.models import Department, User, Role
from app.schemas import DepartmentOut, DepartmentUpdate

router = APIRouter(prefix="/api/departments", tags=["departments"])


@router.get("", response_model=list[DepartmentOut])
def list_departments(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    q = db.query(Department)
    depts = q.order_by(Department.id).all()
    # hidden (admin_only) sections require founder access
    if not current.is_founder:
        depts = [d for d in depts if not d.admin_only]
    return depts


@router.get("/{slug}", response_model=DepartmentOut)
def get_department(slug: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    # Existing API clients can keep their old department URLs.
    if slug == "nevolabs":
        slug = "espadalabs"
    dept = db.query(Department).filter(Department.slug == slug).first()
    if not dept:
        raise HTTPException(404, "Раздел не найден")
    if dept.admin_only and not current.is_founder:
        raise HTTPException(403, "Доступ только для основателей")
    return dept


@router.patch("/{dept_id}", response_model=DepartmentOut)
def update_department(dept_id: int, payload: DepartmentUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    dept = db.get(Department, dept_id)
    if not dept:
        raise HTTPException(404, "Раздел не найден")
    for f, v in payload.model_dump(exclude_unset=True).items():
        setattr(dept, f, v)
    db.commit()
    db.refresh(dept)
    return dept
