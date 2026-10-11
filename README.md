# Espada Workspace

Рабочее пространство команды Espada: задачи в Kanban/Gantt, публичные read-only
доски для клиентов, реестр проектов, CRM и личные трекеры. Встроенный remote MCP
даёт Codex, Claude, Gemini и другим AI-клиентам доступ в рамках прав API-ключа.

## Стек

- **БД:** PostgreSQL 16 (self-hosted, в Docker volume — не зависит от внешних сервисов)
- **Бэкенд:** FastAPI + SQLAlchemy 2.0 + JWT-авторизация
- **Фронтенд:** Next.js 14 (App Router) + dnd-kit (drag & drop)
- **Оркестрация:** Docker Compose (postgres + backend + frontend + nginx)
- **AI-интеграция:** MCP Python SDK 2.x, Streamable HTTP (`/mcp`)

---

## Быстрый старт (production)

Порядок настройки DNS, TLS и Docker Compose описан в [DEPLOY.md](DEPLOY.md).
Для существующей установки используйте раздел «Переход существующей установки
на Espada», чтобы сохранить базу и загруженные аватары.

```bash
# 1. Создать .env из примера
cp .env.example .env

# 2. ОБЯЗАТЕЛЬНО сменить пароли и ключи в .env:
#    - POSTGRES_PASSWORD
#    - SECRET_KEY  (сгенерировать: openssl rand -hex 32)
#    - INITIAL_USER_PASSWORD (одноразовый стартовый пароль)
nano .env

# 3. Поднять весь стек
docker compose up -d --build

# Готово. Приложение на https://espada.anti-flow.com/
```

При первом запуске бэкенд автоматически создаёт таблицы и заполняет демо-данными (команда + клиенты).

### Вход

Первичный вход: `beka@espada.kg` и значение `INITIAL_USER_PASSWORD` из
серверного `.env`. При первом заполнении пустой базы этот пароль получают все
предсозданные сотрудники.
При обновлении существующие логины и пароли не меняются; `@espada.kg` —
адреса входа для новой базы, настройка почтового сервиса не выполняется.

⚠️ **Смените пароли через интерфейс/БД перед реальным использованием.**

---

## Структура проекта

```
espada/
├── docker-compose.yml      # весь стек
├── .env.example            # шаблон переменных окружения
├── nginx/
│   └── nginx.conf          # reverse proxy: / → frontend, /api → backend
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py         # точка входа FastAPI
│       ├── seed.py         # начальные данные
│       ├── core/           # config, database, security (JWT/bcrypt), deps
│       ├── models/         # SQLAlchemy: User, Server, Task, Department
│       ├── schemas/        # Pydantic-схемы
│       └── routers/        # auth, users, servers, tasks, departments
├── mcp-server/             # универсальный remote MCP для AI-клиентов
└── frontend/
    ├── Dockerfile
    ├── package.json
    └── src/
        ├── app/            # роуты: login, dashboard, servers, kanban, team, team/[id]
        ├── components/     # Shell, KanbanBoard, Avatar
        ├── context/        # AppContext (auth + тема)
        └── lib/            # api-клиент, типы
```

---

## Модель прав

Логика в `backend/app/routers/tasks.py` → `_can_modify()`:

- **admin** — может изменять/двигать/удалять любую задачу, создавать ботов и сотрудников, видит «Скрытую часть»
- **staff** — двигает только задачи, где `owner_id == свой id`; чужие показываются с замком 🔒

Должность (`position`: «Тимлид», «Руководитель», «Промпт-инженер», «Бэкенд») — это **отображаемая роль**, не уровень доступа. Доступ задаётся только полем `role` (admin/staff).

---

## Локальная разработка (без Docker)

**Бэкенд:**
```bash
cd backend
pip install -r requirements.txt
# поднять postgres локально или через: docker run -e POSTGRES_PASSWORD=pass -p 5432:5432 postgres:16
export POSTGRES_HOST=localhost POSTGRES_PASSWORD=pass
python -m app.seed
uvicorn app.main:app --reload
```

**Фронтенд:**
```bash
cd frontend
npm install
API_URL=http://localhost:8000 npm run dev
# открыть http://localhost:3000
```

API-документация (Swagger): `http://localhost:8000/docs`

---

## Бэкапы БД

Данные в Docker volume `pgdata`. Бэкап стандартным `pg_dump`:

```bash
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup_$(date +%F).sql
```

Восстановление:
```bash
cat backup.sql | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'
```

---

## SSL

В `nginx/nginx.conf` настроен HTTPS для `espada.anti-flow.com` с сертификатами
Let's Encrypt. Выпустите сертификат до запуска nginx по инструкции в DEPLOY.md.

---

## API эндпоинты

| Метод | Путь | Доступ |
|---|---|---|
| POST | `/api/auth/login` | все |
| GET | `/api/auth/me` | авторизованные |
| GET | `/api/users` | авторизованные |
| POST/PATCH/DELETE | `/api/users` | admin |
| GET | `/api/servers` | авторизованные (фильтры: status, platform, owner_id) |
| POST/PATCH/DELETE | `/api/servers` | admin |
| GET | `/api/tasks` | авторизованные (фильтр: owner_id для личного трекера) |
| POST | `/api/tasks` | авторизованные |
| PATCH | `/api/tasks/{id}/move` | владелец или admin |
| POST/DELETE | `/api/boards/{id}/share` | редактор доски; создать/отозвать публичную ссылку |
| GET | `/api/public/boards/view` | публичный read-only доступ по capability-заголовку |
| GET | `/api/departments` | авторизованные (скрытые — только admin) |
| POST | `/mcp` | Streamable HTTP MCP; персональный `esp_...` API-ключ |

---

## Статус тестирования

- ✅ Бэкенд: 105 тестов на SQLite (включая совместимость переименования, публичные ссылки и CRUD Espada Labs-досок)
- ✅ Фронтенд: 34 теста; все роуты собираются в standalone-режиме
- ✅ MCP: 24 инструмента и 5 protocol-тестов (инициализация Espada, discovery, CRUD-routing, schemas, annotations и tool errors)
- ✅ PostgreSQL 16: миграции до `020`, upgrade/downgrade переименования, первый seed и повторное заполнение без дублей, startup и health проверены на временной базе
- Полный набор API-тестов использует SQLite; перечисленные проверки PostgreSQL не заменяют полный прогон API на PostgreSQL

Боевые миграции выполняются Alembic из backend entrypoint; актуальная head-миграция — `020`.

---

## Alembic — управление миграциями

Инициализация уже выполнена. Initial migration в `backend/migrations/versions/001_initial_schema.py`.

**Применить миграции (вместо `create_all` на проде):**
```bash
cd backend
POSTGRES_HOST=localhost POSTGRES_PASSWORD=... python3.12 -m alembic upgrade head
```

**Создать новую миграцию после изменения моделей:**
```bash
python3.12 -m alembic revision --autogenerate -m "describe_change"
python3.12 -m alembic upgrade head
```

**Откатить последнюю миграцию:**
```bash
python3.12 -m alembic downgrade -1
```

## Безопасность перед проддом

В `.env` обязательно поменять:
```bash
SECRET_KEY=$(openssl rand -hex 32)    # Генерация ключа
POSTGRES_PASSWORD=strong_password_here
ENVIRONMENT=production                 # Включает startup-checks
FRONTEND_URL=https://your-domain.com  # CORS
```

При `ENVIRONMENT=production` приложение не запустится с дефолтным `SECRET_KEY`.
