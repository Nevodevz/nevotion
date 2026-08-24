"""NevOcean MCP server for any Streamable HTTP compatible AI client.

The server is intentionally a thin, stateless adapter. Every tool forwards the
caller's personal API key to the backend, where the same authorization rules as
the web application are enforced.
"""

import os
from datetime import date
from typing import Any, Mapping

import httpx
import uvicorn
from mcp.server import MCPServer
from mcp.server.mcpserver import Context
from mcp.server.mcpserver.exceptions import ToolError
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import ToolAnnotations
from starlette.requests import Request
from starlette.responses import JSONResponse


BACKEND_API_URL = os.environ.get("BACKEND_API_URL", "http://backend:8000/api").rstrip("/")
HOST = os.environ.get("MCP_HOST", "0.0.0.0")
PORT = int(os.environ.get("MCP_PORT", "9000"))


def _csv_env(name: str, default: str) -> list[str]:
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


ALLOWED_HOSTS = _csv_env(
    "MCP_ALLOWED_HOSTS",
    "nevocean.anti-flow.com,localhost:9000,127.0.0.1:9000,testserver",
)
ALLOWED_ORIGINS = _csv_env(
    "MCP_ALLOWED_ORIGINS",
    "https://nevocean.anti-flow.com,http://localhost:9000",
)

READ_ONLY = ToolAnnotations(
    readOnlyHint=True,
    destructiveHint=False,
    idempotentHint=True,
    openWorldHint=False,
)
CREATE = ToolAnnotations(
    readOnlyHint=False,
    destructiveHint=False,
    idempotentHint=False,
    openWorldHint=False,
)
UPDATE = ToolAnnotations(
    readOnlyHint=False,
    destructiveHint=False,
    idempotentHint=True,
    openWorldHint=False,
)
DELETE = ToolAnnotations(
    readOnlyHint=False,
    destructiveHint=True,
    idempotentHint=True,
    openWorldHint=False,
)

mcp = MCPServer(
    name="nevocean",
    title="NevOcean Workspace",
    description="Доски, задачи, сотрудники и CRM NevOcean через персональный API-ключ.",
    instructions=(
        "Работайте только с сущностями, доступными владельцу API-ключа. "
        "Перед изменением задачи сначала прочитайте задачу и доску. "
        "Даты передавайте в формате YYYY-MM-DD."
    ),
    version="1.0.0",
)


def _extract_api_key(headers: Mapping[str, str] | None) -> str | None:
    if not headers:
        return None
    api_key = headers.get("x-api-key") or headers.get("X-API-Key")
    if api_key:
        return api_key.strip()
    authorization = headers.get("authorization") or headers.get("Authorization")
    if not authorization:
        return None
    value = authorization.strip()
    return value[7:].strip() if value.lower().startswith("bearer ") else value


def _error_detail(response: httpx.Response) -> str:
    try:
        payload = response.json()
        if isinstance(payload, dict):
            detail = payload.get("detail") or payload.get("error")
            if detail:
                return str(detail)
    except ValueError:
        pass
    return response.text.strip() or f"HTTP {response.status_code}"


async def _call(ctx: Context, method: str, path: str, **kwargs: Any) -> Any:
    api_key = _extract_api_key(ctx.headers)
    if not api_key:
        raise ToolError(
            "Не передан API-ключ. Настройте Authorization: Bearer <nvo_...> "
            "или X-API-Key: <nvo_...>."
        )

    headers = {"X-API-Key": api_key, "Accept": "application/json"}
    try:
        async with httpx.AsyncClient(
            base_url=BACKEND_API_URL,
            headers=headers,
            timeout=httpx.Timeout(20.0),
        ) as client:
            response = await client.request(method, path, **kwargs)
    except httpx.RequestError as exc:
        raise ToolError(f"Backend NevOcean недоступен: {exc.__class__.__name__}") from exc

    if not response.is_success:
        detail = _error_detail(response)
        if response.status_code == 401:
            raise ToolError("Недействительный или отозванный API-ключ.")
        if response.status_code == 403:
            raise ToolError(f"Нет прав: {detail}")
        if response.status_code == 404:
            raise ToolError(f"Не найдено: {detail}")
        raise ToolError(f"NevOcean API вернул HTTP {response.status_code}: {detail}")
    if response.status_code == 204:
        return {"ok": True}
    return response.json()


@mcp.tool(annotations=READ_ONLY, structured_output=True)
async def list_tasks(
    ctx: Context,
    board_id: int | None = None,
    assignee_id: int | None = None,
    status: str | None = None,
) -> list[dict[str, Any]]:
    """Список задач с фильтрами board_id, assignee_id и status=active|overdue|done."""
    if status not in (None, "active", "overdue", "done"):
        raise ToolError("status должен быть active, overdue или done")
    params: dict[str, Any] = {}
    if board_id is not None:
        params["board_id"] = board_id
    if assignee_id is not None:
        params["assignee_id"] = assignee_id
    tasks = await _call(ctx, "GET", "/tasks", params=params)
    if not isinstance(tasks, list):
        raise ToolError("NevOcean API вернул неожиданный формат списка задач")

    if status:
        today = date.today().isoformat()
        if status == "done":
            tasks = [task for task in tasks if task.get("completed_at")]
        elif status == "active":
            tasks = [
                task for task in tasks
                if not task.get("completed_at")
                and (not task.get("due_date") or task["due_date"] >= today)
            ]
        else:
            tasks = [
                task for task in tasks
                if not task.get("completed_at")
                and task.get("due_date")
                and task["due_date"] < today
            ]
    return tasks


@mcp.tool(annotations=READ_ONLY, structured_output=True)
async def get_task(ctx: Context, task_id: int) -> dict[str, Any]:
    """Получить одну задачу по ID с проверкой прав владельца ключа."""
    result = await _call(ctx, "GET", f"/tasks/{task_id}")
    if not isinstance(result, dict):
        raise ToolError("NevOcean API вернул неожиданный формат задачи")
    return result


@mcp.tool(annotations=CREATE, structured_output=True)
async def create_task(
    ctx: Context,
    title: str,
    board_id: int,
    description: str = "",
    column_id: int | None = None,
    owner_id: int | None = None,
    assignee_ids: list[int] | None = None,
    priority: str = "med",
    start_date: str | None = None,
    due_date: str | None = None,
    tag: str = "Задача",
) -> dict[str, Any]:
    """Создать задачу. Даты start_date/due_date передаются как YYYY-MM-DD."""
    if priority not in ("low", "med", "high"):
        raise ToolError("priority должен быть low, med или high")
    body: dict[str, Any] = {
        "title": title,
        "board_id": board_id,
        "description": description,
        "priority": priority,
        "tag": tag,
    }
    for key, value in {
        "column_id": column_id,
        "owner_id": owner_id,
        "assignee_ids": assignee_ids,
        "start_date": start_date,
        "due_date": due_date,
    }.items():
        if value is not None:
            body[key] = value
    result = await _call(ctx, "POST", "/tasks", json=body)
    if not isinstance(result, dict):
        raise ToolError("NevOcean API вернул неожиданный формат задачи")
    return result


@mcp.tool(annotations=UPDATE, structured_output=True)
async def update_task(
    ctx: Context,
    task_id: int,
    title: str | None = None,
    description: str | None = None,
    priority: str | None = None,
    start_date: str | None = None,
    due_date: str | None = None,
    clear_start_date: bool = False,
    clear_due_date: bool = False,
) -> dict[str, Any]:
    """Изменить основные поля задачи; clear_* удаляет соответствующую дату."""
    if priority not in (None, "low", "med", "high"):
        raise ToolError("priority должен быть low, med или high")
    body = {
        key: value
        for key, value in {
            "title": title,
            "description": description,
            "priority": priority,
            "start_date": start_date,
            "due_date": due_date,
        }.items()
        if value is not None
    }
    if clear_start_date:
        body["start_date"] = None
    if clear_due_date:
        body["due_date"] = None
    if not body:
        raise ToolError("Не передано ни одного изменения")
    result = await _call(ctx, "PATCH", f"/tasks/{task_id}", json=body)
    if not isinstance(result, dict):
        raise ToolError("NevOcean API вернул неожиданный формат задачи")
    return result


@mcp.tool(annotations=UPDATE, structured_output=True)
async def assign_task(ctx: Context, task_id: int, assignee_ids: list[int]) -> dict[str, Any]:
    """Назначить или заменить исполнителей задачи."""
    result = await _call(ctx, "PATCH", f"/tasks/{task_id}", json={"assignee_ids": assignee_ids})
    if not isinstance(result, dict):
        raise ToolError("NevOcean API вернул неожиданный формат задачи")
    return result


@mcp.tool(annotations=UPDATE, structured_output=True)
async def update_task_status(
    ctx: Context,
    task_id: int,
    column_id: int,
    position: int = 0,
) -> dict[str, Any]:
    """Переместить задачу в другую колонку и позицию Kanban."""
    result = await _call(
        ctx,
        "PATCH",
        f"/tasks/{task_id}/move",
        json={"column_id": column_id, "position": position},
    )
    if not isinstance(result, dict):
        raise ToolError("NevOcean API вернул неожиданный формат перемещения")
    return result


@mcp.tool(annotations=UPDATE, structured_output=True)
async def complete_task(ctx: Context, task_id: int) -> dict[str, Any]:
    """Завершить задачу и переместить её в первую done-колонку."""
    result = await _call(ctx, "PATCH", f"/tasks/{task_id}/complete")
    if not isinstance(result, dict):
        raise ToolError("NevOcean API вернул неожиданный формат задачи")
    return result


@mcp.tool(annotations=DELETE, structured_output=True)
async def delete_task(ctx: Context, task_id: int, confirm: bool = False) -> dict[str, Any]:
    """Удалить задачу безвозвратно. Для выполнения передайте confirm=true."""
    if not confirm:
        raise ToolError("Удаление задачи требует confirm=true")
    result = await _call(ctx, "DELETE", f"/tasks/{task_id}")
    if not isinstance(result, dict):
        raise ToolError("NevOcean API вернул неожиданный результат удаления задачи")
    return result


@mcp.tool(annotations=READ_ONLY, structured_output=True)
async def list_boards(ctx: Context) -> list[dict[str, Any]]:
    """Все доски, доступные владельцу API-ключа, вместе с колонками."""
    result = await _call(ctx, "GET", "/boards")
    if not isinstance(result, list):
        raise ToolError("NevOcean API вернул неожиданный формат списка досок")
    return result


@mcp.tool(annotations=READ_ONLY, structured_output=True)
async def get_board(ctx: Context, board_id: int) -> dict[str, Any]:
    """Получить доску и её колонки по ID."""
    result = await _call(ctx, "GET", f"/boards/{board_id}")
    if not isinstance(result, dict):
        raise ToolError("NevOcean API вернул неожиданный формат доски")
    return result


@mcp.tool(annotations=CREATE, structured_output=True)
async def create_board_column(
    ctx: Context,
    board_id: int,
    name: str,
    color: str = "#767586",
    is_done: bool = False,
) -> dict[str, Any]:
    """Добавить колонку в доступную Kanban-доску."""
    result = await _call(
        ctx,
        "POST",
        f"/boards/{board_id}/columns",
        json={"name": name, "color": color, "is_done": is_done},
    )
    if not isinstance(result, dict):
        raise ToolError("NevOcean API вернул неожиданный формат колонки")
    return result


@mcp.tool(annotations=UPDATE, structured_output=True)
async def update_board_column(
    ctx: Context,
    column_id: int,
    name: str | None = None,
    color: str | None = None,
    is_done: bool | None = None,
) -> dict[str, Any]:
    """Изменить название, цвет или признак Done у колонки доски."""
    body = {
        key: value
        for key, value in {"name": name, "color": color, "is_done": is_done}.items()
        if value is not None
    }
    if not body:
        raise ToolError("Не передано ни одного изменения колонки")
    result = await _call(ctx, "PATCH", f"/boards/columns/{column_id}", json=body)
    if not isinstance(result, dict):
        raise ToolError("NevOcean API вернул неожиданный формат колонки")
    return result


@mcp.tool(annotations=UPDATE, structured_output=True)
async def reorder_board_column(
    ctx: Context,
    column_id: int,
    new_position: int,
) -> dict[str, Any]:
    """Переместить колонку на новую позицию, начиная с нуля."""
    if new_position < 0:
        raise ToolError("new_position не может быть отрицательным")
    result = await _call(
        ctx,
        "PATCH",
        f"/boards/columns/{column_id}/position",
        params={"new_position": new_position},
    )
    if not isinstance(result, dict):
        raise ToolError("NevOcean API вернул неожиданный формат колонки")
    return result


@mcp.tool(annotations=DELETE, structured_output=True)
async def delete_board_column(
    ctx: Context,
    column_id: int,
    confirm: bool = False,
) -> dict[str, Any]:
    """Удалить колонку; её задачи перейдут в первую оставшуюся. Требует confirm=true."""
    if not confirm:
        raise ToolError("Удаление колонки требует confirm=true")
    result = await _call(ctx, "DELETE", f"/boards/columns/{column_id}")
    if not isinstance(result, dict):
        raise ToolError("NevOcean API вернул неожиданный результат удаления колонки")
    return result


@mcp.tool(annotations=READ_ONLY, structured_output=True)
async def list_lab_projects(
    ctx: Context,
    include_archived: bool = False,
) -> list[dict[str, Any]]:
    """Список NevoLabs-проектов с ID связанной Kanban-доски и участниками."""
    result = await _call(
        ctx,
        "GET",
        "/lab-projects",
        params={"include_archived": include_archived},
    )
    if not isinstance(result, list):
        raise ToolError("NevOcean API вернул неожиданный формат списка NevoLabs-проектов")
    return result


@mcp.tool(annotations=READ_ONLY, structured_output=True)
async def get_lab_project(ctx: Context, project_id: int) -> dict[str, Any]:
    """Получить NevoLabs-проект, его статус, участников и board_id."""
    result = await _call(ctx, "GET", f"/lab-projects/{project_id}")
    if not isinstance(result, dict):
        raise ToolError("NevOcean API вернул неожиданный формат NevoLabs-проекта")
    return result


@mcp.tool(annotations=CREATE, structured_output=True)
async def create_lab_project(
    ctx: Context,
    name: str,
    description: str = "",
    status: str = "Идея",
    member_ids: list[int] | None = None,
) -> dict[str, Any]:
    """Создать NevoLabs-проект и его Kanban-доску с базовыми колонками."""
    result = await _call(
        ctx,
        "POST",
        "/lab-projects",
        json={
            "name": name,
            "description": description,
            "status": status,
            "member_ids": member_ids or [],
        },
    )
    if not isinstance(result, dict):
        raise ToolError("NevOcean API вернул неожиданный формат NevoLabs-проекта")
    return result


@mcp.tool(annotations=UPDATE, structured_output=True)
async def update_lab_project(
    ctx: Context,
    project_id: int,
    name: str | None = None,
    description: str | None = None,
    status: str | None = None,
    member_ids: list[int] | None = None,
) -> dict[str, Any]:
    """Изменить проект; новое имя автоматически применяется к его доске."""
    body = {
        key: value
        for key, value in {
            "name": name,
            "description": description,
            "status": status,
            "member_ids": member_ids,
        }.items()
        if value is not None
    }
    if not body:
        raise ToolError("Не передано ни одного изменения NevoLabs-проекта")
    result = await _call(ctx, "PATCH", f"/lab-projects/{project_id}", json=body)
    if not isinstance(result, dict):
        raise ToolError("NevOcean API вернул неожиданный формат NevoLabs-проекта")
    return result


@mcp.tool(annotations=DELETE, structured_output=True)
async def archive_lab_project(
    ctx: Context,
    project_id: int,
    confirm: bool = False,
) -> dict[str, Any]:
    """Архивировать проект и скрыть его доску. Для выполнения передайте confirm=true."""
    if not confirm:
        raise ToolError("Архивация NevoLabs-проекта требует confirm=true")
    result = await _call(ctx, "POST", f"/lab-projects/{project_id}/archive")
    if not isinstance(result, dict):
        raise ToolError("NevOcean API вернул неожиданный формат NevoLabs-проекта")
    return result


@mcp.tool(annotations=UPDATE, structured_output=True)
async def add_lab_project_member(
    ctx: Context,
    project_id: int,
    user_id: int,
) -> dict[str, Any]:
    """Добавить сотрудника в NevoLabs-проект."""
    result = await _call(
        ctx,
        "POST",
        f"/lab-projects/{project_id}/members",
        json={"user_id": user_id},
    )
    if not isinstance(result, dict):
        raise ToolError("NevOcean API вернул неожиданный формат NevoLabs-проекта")
    return result


@mcp.tool(annotations=DELETE, structured_output=True)
async def remove_lab_project_member(
    ctx: Context,
    project_id: int,
    user_id: int,
) -> dict[str, Any]:
    """Удалить сотрудника из NevoLabs-проекта."""
    result = await _call(
        ctx,
        "DELETE",
        f"/lab-projects/{project_id}/members/{user_id}",
    )
    if not isinstance(result, dict):
        raise ToolError("NevOcean API вернул неожиданный формат NevoLabs-проекта")
    return result


@mcp.tool(annotations=READ_ONLY, structured_output=True)
async def list_users(ctx: Context) -> list[dict[str, Any]]:
    """Активные сотрудники для поиска владельцев и исполнителей задач."""
    users = await _call(ctx, "GET", "/users")
    if not isinstance(users, list):
        raise ToolError("NevOcean API вернул неожиданный формат списка сотрудников")
    return [
        {
            "id": user["id"],
            "name": user["name"],
            "position": user.get("position", ""),
            "is_active": user.get("is_active", True),
        }
        for user in users
    ]


@mcp.tool(annotations=READ_ONLY, structured_output=True)
async def list_leads(
    ctx: Context,
    status: str | None = None,
    stage_id: int | None = None,
    setter_id: int | None = None,
    closer_id: int | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    """Список CRM-лидов с фильтрами и пагинацией."""
    params = {
        key: value
        for key, value in {
            "status": status,
            "stage_id": stage_id,
            "setter_id": setter_id,
            "closer_id": closer_id,
            "limit": max(1, min(limit, 100)),
            "offset": max(0, offset),
        }.items()
        if value is not None
    }
    result = await _call(ctx, "GET", "/leads", params=params)
    if isinstance(result, list):
        return {"items": result, "total": len(result)}
    if not isinstance(result, dict):
        raise ToolError("NevOcean API вернул неожиданный формат списка лидов")
    return result


@mcp.tool(annotations=READ_ONLY, structured_output=True)
async def get_lead(ctx: Context, lead_id: int) -> dict[str, Any]:
    """Получить полную карточку CRM-лида по ID."""
    result = await _call(ctx, "GET", f"/leads/{lead_id}")
    if not isinstance(result, dict):
        raise ToolError("NevOcean API вернул неожиданный формат лида")
    return result


@mcp.custom_route("/healthz", methods=["GET"], include_in_schema=False)
async def healthz(_: Request) -> JSONResponse:
    return JSONResponse({"status": "ok", "protocol": "mcp-streamable-http", "version": "1.0.0"})


transport_security = TransportSecuritySettings(
    enable_dns_rebinding_protection=True,
    allowed_hosts=ALLOWED_HOSTS,
    allowed_origins=ALLOWED_ORIGINS,
)

asgi_app = mcp.streamable_http_app(
    streamable_http_path="/mcp",
    json_response=True,
    stateless_http=True,
    transport_security=transport_security,
    host=HOST,
)


if __name__ == "__main__":
    uvicorn.run(asgi_app, host=HOST, port=PORT)
