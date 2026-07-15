from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.core.database import Base, engine
from app.middleware import last_seen_middleware
from app.routers import (
    auth, users, projects, tasks, departments, boards, sales, marketing,
    search, notifications, meetings, bug_reports, leads, finance, payroll, analytics,
    api_keys, lab_projects,
)
from app.routers import settings as settings_router

limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.check_production_security()
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="NevoDevs API", version="2.1.0", lifespan=lifespan)

# Rate limit error handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — allow origins from env
origins = [settings.FRONTEND_URL]
if settings.ENVIRONMENT != "production":
    origins += ["http://localhost:3000", "http://127.0.0.1:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,  # Bearer token in header, no cookies
    allow_methods=["*"],
    allow_headers=["*"],
)

app.middleware('http')(last_seen_middleware)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(projects.router)
app.include_router(boards.router)
app.include_router(tasks.router)
app.include_router(departments.router)
app.include_router(sales.router)
app.include_router(marketing.router)
app.include_router(search.router)
app.include_router(notifications.router)
app.include_router(meetings.router)
app.include_router(bug_reports.router)
app.include_router(settings_router.router)
app.include_router(leads.router)
app.include_router(finance.router)
app.include_router(payroll.router)
app.include_router(analytics.router)
app.include_router(api_keys.router)
app.include_router(lab_projects.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "2.1.0", "env": settings.ENVIRONMENT}
