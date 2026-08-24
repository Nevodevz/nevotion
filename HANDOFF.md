# NevoDevs Workspace — Handoff (v2)

## Стек
- **БД:** PostgreSQL (Docker, self-hosted) — без внешних тарифов
- **Бэкенд:** FastAPI + SQLAlchemy 2.0 + JWT + bcrypt
- **Фронтенд:** Next.js 15 + dnd-kit (drag&drop)
- **Деплой:** docker-compose (postgres + backend + frontend + nginx)

## Логины
Стартовый пароль задаётся секретом `INITIAL_USER_PASSWORD` при первом заполнении
пустой базы. После первого входа его нужно заменить для каждого пользователя.
| Кто | Email | Роль |
|---|---|---|
| Бека | beka@nevodevs.kg | admin, основатель, Руководитель |
| Эрбол | erbol@nevodevs.kg | admin, основатель, Тимлид |
| Арслан | arslan@nevodevs.kg | admin, основатель, Продажи |
| Абылай | abylay@nevodevs.kg | admin, основатель, Продажи |
| Назар | nazar@nevodevs.kg | admin, основатель, Маркетинг |
| Тимур | timur@nevodevs.kg | admin, основатель, Тех лид (бэкенд) |
| Адахан | adahan@nevodevs.kg | admin, основатель, Финансы |
| Азамат/Ариет/Абдулла/Туратбек/Эмирлан | *@nevodevs.kg | staff, Промптеры |
| Талгат/Бектур/Мирослав | *@nevodevs.kg | staff, Бэкенд |
| Рахима/Минай | *@nevodevs.kg | staff, Продажи |
| Ахмад | ahmad@nevodevs.kg | staff, ОКК |

## Архитектура ролей
- `role` (admin/staff) — уровень доступа. Admin может всё: CRUD сотрудников, выдача ролей, редактирование любых задач/таблиц.
- `is_founder` — доступ к «Скрытой части». Все основатели = admin + founder.
- `position` — отображаемая должность (Тимлид, Промпт-инженер, Бэкенд…).
- Сотрудник двигает/редактирует только свои задачи; на общих досках (бэкенд-очередь, ОКК) — все.

## Страницы (по отделам, kind в departments)
- **Главная** (`/dashboard`) — статы, список отделов, команда разработки.
- **Разработка** (`dept kind=dev`) — холст: Backend-команда, Промпт-инженеры (каунтеры; у Тимлида Эрбола = сумма всех промптеров), Server List (WhatsApp), Бэкенд-очередь (To-do/In progress/Done, поля: запросчик, бэкендеры multi-select, тип задачи).
- **Продажи** (`kind=sales`) — таблица-дневник: дата+сотрудник+метрики (Касания, Дозвоны…). Редактируемые колонки, фильтр по имени+дате, добавление сотрудников.
- **Маркетинг** (`kind=marketing`) — таблица (Идея/Сценарий/Монтаж/Планировка), редактируемые колонки, фильтр по дате.
- **Финансы** (`kind=finance`) — iframe Google Sheets (admin вставляет ссылку).
- **ОКК** (`kind=qcc`) — общий трекер Ахмада, виден/редактируем всеми.
- **Скрытая часть** (`kind=hidden`, admin_only) — трекеры основателей, только founder.
- **О компании** (`kind=about`) — текст, редактируемый только admin.

## Доски/задачи
- У каждого сотрудника личный канбан с **редактируемыми колонками** (добавить/переименовать/цвет/удалить).
- Колонка с флагом `is_done` → при перемещении/«Завершить» автоматически ставит `completed_at`.
- Тег задачи — свободный текст + цвет.

## Запуск (Mac, dev)
```bash
# Postgres (Docker) или brew services start postgresql@14
cd backend
python3.12 -m pip install -r requirements.txt
POSTGRES_HOST=localhost POSTGRES_PASSWORD=nevodevs_pass python3.12 -m app.seed
POSTGRES_HOST=localhost POSTGRES_PASSWORD=nevodevs_pass python3.12 -m uvicorn app.main:app --reload
# второй терминал
cd frontend && npm install && npm run dev
```
Открыть http://localhost:3000 · Swagger http://localhost:8000/docs

## Прод
```bash
cp .env.example .env   # сменить POSTGRES_PASSWORD, SECRET_KEY и INITIAL_USER_PASSWORD
docker compose up -d --build
```

## Пересоздание БД (после изменения seed)
```bash
dropdb nevodevs && createdb -O nevodevs nevodevs
python3.12 -m app.seed
```

## Статус
- Бэкенд: 45 роутов, все интеграционные тесты прошли (роли, founder-gating, агрегат тимлида, завершение задач, бэкенд-очередь, продажи/маркетинг с фильтрами, кастомные колонки).
- Фронтенд: собирается чисто, 6 роутов. Все отделы реализованы.
- Финансы: вставить ссылку Google Sheets (Publish to web → Embed).
- «О компании»: наполнить через кнопку «Редактировать» (admin).
