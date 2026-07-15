"""NevoOcean MCP Server — управление задачами от имени пользователя через API-ключ.

Работает как remote-сервис по протоколу MCP Streamable HTTP. Пользователь подключает
его в Claude как custom connector по URL (https://<host>/mcp) и передаёт свой
персональный API-ключ (Authorization: Bearer <key> либо X-API-Key: <key>).
Каждый вызов инструмента проксируется в backend с заголовком X-API-Key — все
проверки прав выполняет backend, MCP-сервис их не обходит.
"""

import contextvars
import json
import os
from datetime import date
from typing import Any

import httpx
import uvicorn
from mcp.server.lowlevel import Server
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from mcp.types import TextContent, Tool
from starlette.responses import JSONResponse
from starlette.types import Receive, Scope, Send

BACKEND_API_URL = os.environ.get("BACKEND_API_URL", "http://backend:8000/api").rstrip("/")
HOST = os.environ.get("MCP_HOST", "0.0.0.0")
PORT = int(os.environ.get("MCP_PORT", "9000"))

NO_API_KEY_ERROR = {
    "error": "Не передан API-ключ. Подключите коннектор с заголовком "
    "Authorization: Bearer <ваш ключ> или X-API-Key: <ваш ключ> "
    "(ключ создаётся в Профиле NevoOcean)."
}

_api_key_ctx: contextvars.ContextVar[str | None] = contextvars.ContextVar("api_key", default=None)

app = Server("nevoocean")


def _client() -> httpx.Client:
    api_key = _api_key_ctx.get()
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["X-API-Key"] = api_key
    return httpx.Client(base_url=BACKEND_API_URL, headers=headers, timeout=15)


def _call(method: str, path: str, **kwargs) -> Any:
    if not _api_key_ctx.get():
        return dict(NO_API_KEY_ERROR)
    with _client() as c:
        resp = getattr(c, method)(path, **kwargs)
    if resp.status_code == 403:
        return {"error": f"Нет прав: {resp.text}"}
    if resp.status_code == 404:
        return {"error": "Не найдено"}
    if resp.status_code == 401:
        return {"error": "Недействительный или отозванный API-ключ."}
    if not resp.is_success:
        return {"error": f"HTTP {resp.status_code}: {resp.text}"}
    if resp.status_code == 204:
        return {"ok": True}
    return resp.json()


def _text(data: Any) -> list[TextContent]:
    return [TextContent(type="text", text=json.dumps(data, ensure_ascii=False, indent=2))]


@app.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="list_tasks",
            description="Список задач. Фильтры: board_id, assignee_id, status (active/overdue/done).",
            inputSchema={
                "type": "object",
                "properties": {
                    "board_id": {"type": "integer", "description": "ID доски"},
                    "assignee_id": {"type": "integer", "description": "ID исполнителя"},
                    "status": {"type": "string", "enum": ["active", "overdue", "done"], "description": "Фильтр статуса"},
                },
            },
        ),
        Tool(
            name="get_task",
            description="Детали задачи по ID.",
            inputSchema={
                "type": "object",
                "properties": {"task_id": {"type": "integer"}},
                "required": ["task_id"],
            },
        ),
        Tool(
            name="create_task",
            description="Создать задачу на доске.",
            inputSchema={
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "board_id": {"type": "integer"},
                    "description": {"type": "string"},
                    "column_id": {"type": "integer"},
                    "assignee_ids": {"type": "array", "items": {"type": "integer"}},
                    "priority": {"type": "string", "enum": ["low", "med", "high"]},
                    "due_date": {"type": "string", "description": "YYYY-MM-DD"},
                    "tag": {"type": "string"},
                },
                "required": ["title", "board_id"],
            },
        ),
        Tool(
            name="assign_task",
            description="Назначить/переназначить исполнителей задачи.",
            inputSchema={
                "type": "object",
                "properties": {
                    "task_id": {"type": "integer"},
                    "assignee_ids": {"type": "array", "items": {"type": "integer"}},
                },
                "required": ["task_id", "assignee_ids"],
            },
        ),
        Tool(
            name="update_task_status",
            description="Переместить задачу в другую колонку.",
            inputSchema={
                "type": "object",
                "properties": {
                    "task_id": {"type": "integer"},
                    "column_id": {"type": "integer"},
                    "position": {"type": "integer", "default": 0},
                },
                "required": ["task_id", "column_id"],
            },
        ),
        Tool(
            name="complete_task",
            description="Завершить задачу (переместить в колонку Done).",
            inputSchema={
                "type": "object",
                "properties": {"task_id": {"type": "integer"}},
                "required": ["task_id"],
            },
        ),
        Tool(
            name="list_boards",
            description="Список досок, доступных текущему пользователю.",
            inputSchema={"type": "object", "properties": {}},
        ),
        Tool(
            name="list_users",
            description="Список сотрудников (имя, позиция, id) для назначения задач.",
            inputSchema={"type": "object", "properties": {}},
        ),
        Tool(
            name="list_leads",
            description="Список лидов. Фильтры: status (active/archived), stage_id, setter_id, closer_id.",
            inputSchema={
                "type": "object",
                "properties": {
                    "status": {"type": "string", "enum": ["active", "archived"]},
                    "stage_id": {"type": "integer"},
                    "setter_id": {"type": "integer"},
                    "closer_id": {"type": "integer"},
                    "limit": {"type": "integer", "default": 50},
                    "offset": {"type": "integer", "default": 0},
                },
            },
        ),
        Tool(
            name="get_lead",
            description="Карточка лида по ID.",
            inputSchema={
                "type": "object",
                "properties": {"lead_id": {"type": "integer"}},
                "required": ["lead_id"],
            },
        ),
    ]


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    if not _api_key_ctx.get():
        return _text(NO_API_KEY_ERROR)

    if name == "list_tasks":
        params = {}
        if "board_id" in arguments:
            params["board_id"] = arguments["board_id"]
        if "assignee_id" in arguments:
            params["assignee_id"] = arguments["assignee_id"]
        data = _call("get", "/tasks", params=params)
        status_filter = arguments.get("status")
        if isinstance(data, list) and status_filter:
            today = date.today().isoformat()
            if status_filter == "done":
                data = [t for t in data if t.get("completed_at")]
            elif status_filter == "active":
                data = [t for t in data if not t.get("completed_at") and (not t.get("due_date") or t["due_date"] >= today)]
            elif status_filter == "overdue":
                data = [t for t in data if not t.get("completed_at") and t.get("due_date") and t["due_date"] < today]
        return _text(data)

    elif name == "get_task":
        task_id = arguments["task_id"]
        data = _call("get", "/tasks", params={})
        if isinstance(data, list):
            task = next((t for t in data if t["id"] == task_id), None)
            return _text(task or {"error": "Задача не найдена"})
        return _text(data)

    elif name == "create_task":
        body = {k: v for k, v in arguments.items()}
        data = _call("post", "/tasks", json=body)
        return _text(data)

    elif name == "assign_task":
        task_id = arguments["task_id"]
        data = _call("patch", f"/tasks/{task_id}", json={"assignee_ids": arguments["assignee_ids"]})
        return _text(data)

    elif name == "update_task_status":
        task_id = arguments["task_id"]
        body = {
            "column_id": arguments["column_id"],
            "position": arguments.get("position", 0),
        }
        data = _call("patch", f"/tasks/{task_id}/move", json=body)
        return _text(data)

    elif name == "complete_task":
        task_id = arguments["task_id"]
        data = _call("patch", f"/tasks/{task_id}/complete")
        return _text(data)

    elif name == "list_boards":
        me = _call("get", "/auth/me")
        if isinstance(me, dict) and "error" in me:
            return _text(me)
        user_data = _call("get", f"/users/{me['id']}")
        if isinstance(user_data, dict) and "error" in user_data:
            return _text(user_data)
        boards: list[Any] = []
        personal = _call("get", f"/boards/personal/{me['id']}")
        if isinstance(personal, dict) and "error" not in personal:
            boards.append(personal)
        for dept_id in user_data.get("department_ids", []):
            dept_boards = _call("get", f"/boards/by-department/{dept_id}")
            if isinstance(dept_boards, list):
                boards.extend(dept_boards)
        return _text(boards)

    elif name == "list_users":
        data = _call("get", "/users")
        if isinstance(data, list):
            data = [{"id": u["id"], "name": u["name"], "position": u.get("position", ""), "is_active": u.get("is_active", True)} for u in data]
        return _text(data)

    elif name == "list_leads":
        params = {}
        for key in ("status", "stage_id", "setter_id", "closer_id", "limit", "offset"):
            if key in arguments:
                params[key] = arguments[key]
        data = _call("get", "/leads", params=params)
        return _text(data)

    elif name == "get_lead":
        lead_id = arguments["lead_id"]
        data = _call("get", f"/leads/{lead_id}")
        return _text(data)

    else:
        return _text({"error": f"Неизвестный инструмент: {name}"})


def _extract_api_key(scope: Scope) -> str | None:
    headers = dict(scope.get("headers") or [])
    raw_api_key = headers.get(b"x-api-key")
    if raw_api_key:
        return raw_api_key.decode().strip()
    raw_auth = headers.get(b"authorization")
    if raw_auth:
        value = raw_auth.decode().strip()
        if value.lower().startswith("bearer "):
            return value[7:].strip()
        return value
    return None


session_manager = StreamableHTTPSessionManager(
    app=app,
    json_response=True,
    stateless=True,
)


async def handle_mcp(scope: Scope, receive: Receive, send: Send) -> None:
    token = _api_key_ctx.set(_extract_api_key(scope))
    try:
        await session_manager.handle_request(scope, receive, send)
    finally:
        _api_key_ctx.reset(token)


async def handle_healthz(scope: Scope, receive: Receive, send: Send) -> None:
    response = JSONResponse({"status": "ok"})
    await response(scope, receive, send)


async def asgi_app(scope: Scope, receive: Receive, send: Send) -> None:
    if scope["type"] == "lifespan":
        async with session_manager.run():
            message = await receive()
            assert message["type"] == "lifespan.startup"
            await send({"type": "lifespan.startup.complete"})
            message = await receive()
            assert message["type"] == "lifespan.shutdown"
            await send({"type": "lifespan.shutdown.complete"})
        return

    path = scope["path"]
    if path == "/healthz":
        await handle_healthz(scope, receive, send)
    elif path == "/mcp" or path.startswith("/mcp/"):
        await handle_mcp(scope, receive, send)
    else:
        response = JSONResponse({"error": "Не найдено"}, status_code=404)
        await response(scope, receive, send)


if __name__ == "__main__":
    uvicorn.run(asgi_app, host=HOST, port=PORT)
