# NevOcean MCP Server

Универсальный remote MCP-сервис на официальном Python SDK 2.x. Работает по
Streamable HTTP в stateless-режиме и подходит любому клиенту, который умеет
подключать HTTP MCP-серверы: Codex, Claude, Gemini и другим.

Production URL:

```text
https://nevocean.anti-flow.com/mcp
```

## Аутентификация

Каждый AI-клиент действует от имени владельца персонального ключа `nvo_...`,
созданного в **Профиль → API-ключи**. Поддерживаются оба заголовка:

```http
Authorization: Bearer nvo_...
X-API-Key: nvo_...
```

MCP-сервис не хранит ключ. Он передаёт его backend API, поэтому для AI действуют
те же проверки досок, задач и CRM, что и для пользователя в веб-интерфейсе.
Ошибки авторизации и API возвращаются как настоящие MCP tool errors (`isError`),
а успешные вызовы — одновременно как text и structured content.

## Подключение клиентов

### Codex CLI

Codex умеет читать Bearer-токен из переменной среды, поэтому секрет не попадает
в команду или `config.toml`:

```powershell
$env:NEVOCEAN_API_KEY = "nvo_..."
codex mcp add nevocean --url https://nevocean.anti-flow.com/mcp --bearer-token-env-var NEVOCEAN_API_KEY
```

### Claude Code

```powershell
claude mcp add --transport http --scope user nevocean https://nevocean.anti-flow.com/mcp --header "Authorization: Bearer nvo_..."
```

В Claude web/desktop тот же URL можно добавить как custom connector и указать
персональный ключ в поле авторизации.

### Gemini CLI

```powershell
gemini mcp add --transport http --scope user nevocean https://nevocean.anti-flow.com/mcp --header "Authorization: Bearer nvo_..."
```

### Другой MCP-клиент

Минимальная конфигурация выглядит так (синтаксис подстановки переменных зависит
от клиента):

```json
{
  "mcpServers": {
    "nevocean": {
      "type": "http",
      "url": "https://nevocean.anti-flow.com/mcp",
      "headers": {
        "Authorization": "Bearer ${NEVOCEAN_API_KEY}"
      }
    }
  }
}
```

## Инструменты

| Инструмент | Режим | Назначение |
|---|---|---|
| `list_tasks` | read | Задачи с фильтрами по доске, исполнителю и состоянию |
| `get_task` | read | Одна задача по ID |
| `create_task` | write | Создать задачу, включая начало и срок |
| `update_task` | write | Изменить основные поля и даты |
| `assign_task` | write | Назначить исполнителей |
| `update_task_status` | write | Переместить карточку Kanban |
| `complete_task` | write | Завершить задачу |
| `delete_task` | destructive | Удалить задачу с обязательным `confirm=true` |
| `list_boards` | read | Все доступные доски и их колонки |
| `get_board` | read | Одна доска по ID |
| `create_board_column` | write | Добавить колонку Kanban |
| `update_board_column` | write | Изменить колонку |
| `reorder_board_column` | write | Переместить колонку |
| `delete_board_column` | destructive | Удалить колонку с переносом задач |
| `list_lab_projects` | read | NevoLabs-проекты, включая архив по запросу |
| `get_lab_project` | read | Проект, статус, участники и `board_id` |
| `create_lab_project` | write | Создать проект и его Kanban-доску |
| `update_lab_project` | write | Изменить проект и синхронно переименовать доску |
| `archive_lab_project` | destructive | Архивировать проект и скрыть доску |
| `add_lab_project_member` | write | Добавить участника проекта |
| `remove_lab_project_member` | write | Удалить участника проекта |
| `list_users` | read | Сотрудники для назначения задач |
| `list_leads` | read | CRM-лиды с фильтрами и пагинацией |
| `get_lead` | read | Полная карточка лида |

У каждого инструмента опубликованы JSON input/output schemas и MCP annotations
(`readOnlyHint`, `idempotentHint`, `destructiveHint`), чтобы клиент мог корректно
запрашивать подтверждение перед изменениями.

## Запуск

```bash
cd mcp-server
pip install -r requirements.txt
BACKEND_API_URL=http://localhost:8000/api python server.py
```

Проверка живости:

```bash
curl http://localhost:9000/healthz
```

Переменные среды:

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `BACKEND_API_URL` | `http://backend:8000/api` | Backend API |
| `MCP_HOST` | `0.0.0.0` | Bind address |
| `MCP_PORT` | `9000` | Порт |
| `MCP_ALLOWED_HOSTS` | production + localhost | Разрешённые HTTP Host для защиты от DNS rebinding |
| `MCP_ALLOWED_ORIGINS` | production + localhost | Разрешённые Origin |

## Проверка

```bash
pip install -r requirements-dev.txt
pytest -q tests
```

Тесты проверяют health endpoint, protocol-level `tools/list`, structured output,
annotations, маршрутизацию CRUD-вызовов и то, что отсутствие ключа или
подтверждения разрушительной операции возвращается как `isError: true`.
