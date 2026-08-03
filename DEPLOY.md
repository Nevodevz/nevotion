# NevoOcean — production-деплой

Production-стек: PostgreSQL 16, FastAPI, Next.js, MCP и nginx. Все сервисы
запускаются через Docker Compose, TLS-сертификат хранится на хосте в
`/etc/letsencrypt`.

## Требования

- Ubuntu 24.04 или совместимый Linux-сервер;
- Docker с командой `docker compose`;
- certbot;
- открытые TCP-порты 22, 80 и 443;
- DNS A-запись `nevocean.anti-flow.com`, указывающая на сервер.

## Конфигурация

Создайте `.env` рядом с `docker-compose.yml`. Файл не должен попадать в Git.

```dotenv
COMPOSE_PROJECT_NAME=nevocean
POSTGRES_USER=nevodevs
POSTGRES_PASSWORD=<openssl rand -hex 32>
POSTGRES_DB=nevodevs
SECRET_KEY=<openssl rand -hex 32>
INITIAL_USER_PASSWORD=<случайный одноразовый пароль>
ENVIRONMENT=production
FRONTEND_URL=https://nevocean.anti-flow.com
MEDIA_ROOT=/app/media
```

`INITIAL_USER_PASSWORD` используется только при первом заполнении пустой базы.
После первого входа смените пароли пользователей через NevoOcean.

## Первый сертификат

Создайте `/var/www/certbot` и временно поднимите HTTP-сервер, который отдаёт
`/.well-known/acme-challenge/` из этой директории. Затем запросите сертификат:

```bash
certbot certonly --webroot -w /var/www/certbot \
  -d nevocean.anti-flow.com --agree-tos --non-interactive
```

Для автоматического продления должен быть включён `certbot.timer`. Конфигурация
nginx монтирует `/etc/letsencrypt` только для чтения и постоянно обслуживает
ACME-путь через `/var/www/certbot`.

## Запуск и проверка

```bash
docker compose --env-file .env up -d --build
docker compose --env-file .env ps
docker compose --env-file .env exec backend alembic current
curl -fsS https://nevocean.anti-flow.com/api/health
```

Миграции и идемпотентное начальное заполнение базы выполняются entrypoint-скриптом
backend. Данные PostgreSQL и загруженные аватары хранятся в именованных томах
`nevocean_pgdata` и `nevocean_media`.

## Обновление

Загрузите новый проверенный release, сохраните production `.env` и запустите:

```bash
docker compose --env-file .env up -d --build
```

Перед обновлением сделайте резервную копию:

```bash
docker compose --env-file .env exec -T db \
  pg_dump -U nevodevs nevodevs > nevocean-backup.sql
```

Не используйте `docker compose down -v` в production: ключ `-v` удаляет базу и
загруженные медиа.
