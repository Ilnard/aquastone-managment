# Запуск AquaStone на рабочем сервере

Инструкция для VPS на Ubuntu 22.04/24.04 (подойдёт любой хостинг с root-доступом: Timeweb Cloud, Selectel, Yandex Cloud и т. п.).
Минимум: 2 ГБ памяти, 20 ГБ диска (вложения — фотоотчёты и чертежи — со временем займут больше).

Схема: один домен (ниже — `crm.aquastone.ru`, замените на свой).

| Адрес | Что открывается |
|---|---|
| `https://crm.aquastone.ru/` | система управления |
| `https://crm.aquastone.ru/constructor/` | конструктор столешниц |
| `https://crm.aquastone.ru/api/` | сервер (Node.js, PostgreSQL) |

Один домен обязателен: cookie входа привязана к домену, и только так менеджер, вошедший в систему управления, узнаётся в конструкторе.

## 1. Сервер

```bash
sudo apt update && sudo apt install -y nginx postgresql rsync certbot python3-certbot-nginx
# Node.js 22 (нужен для --env-file-if-exists)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
sudo useradd --system --create-home --home-dir /opt/aquastone aquastone
```

## 2. База данных

```bash
sudo -u postgres psql -c "CREATE USER aquastone WITH PASSWORD 'придумайте-длинный-пароль';"
sudo -u postgres psql -c "CREATE DATABASE aquastone OWNER aquastone;"
```

Перенос данных с текущего компьютера (если уже работали локально):

```bash
# на компьютере, где сейчас база:
pg_dump --format=custom --no-owner -U postgres aquastone > aquastone.dump
# на сервере:
pg_restore --no-owner -d aquastone -U aquastone -h 127.0.0.1 aquastone.dump
```

Папку `uploads` с компьютера скопируйте в `/opt/aquastone/aquastone-managment/uploads/`.

## 3. Код и настройки

```bash
sudo -u aquastone -i
git clone <адрес репозитория> aquastone-managment
cd aquastone-managment && npm ci && npm test && npm run build
```

Файл `/opt/aquastone/aquastone-managment/.env`:

```
NODE_ENV=production
COOKIE_SECURE=1
API_PORT=3001
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=aquastone
PGUSER=aquastone
PGPASSWORD=придумайте-длинный-пароль
```

`chmod 600 .env` — пароль от базы не должен читаться другими пользователями.

Конструктор собирается с адресом `/constructor/`:

```bash
cd /opt/aquastone && git clone <адрес репозитория конструктора> aquastone-constructor
cd aquastone-constructor && npm ci && CONSTRUCTOR_BASE=/constructor/ npm run build
```

Сборки раскладываем туда, откуда их раздаёт nginx:

```bash
sudo mkdir -p /var/www/aquastone
sudo rsync -a --delete /opt/aquastone/aquastone-managment/dist/ /var/www/aquastone/management/
sudo rsync -a --delete /opt/aquastone/aquastone-constructor/dist/ /var/www/aquastone/constructor/
```

## 4. Сервер API (systemd)

```bash
sudo cp /opt/aquastone/aquastone-managment/deploy/aquastone-api.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now aquastone-api
journalctl -u aquastone-api -n 50   # при первом запуске здесь логин и пароль директора
```

## 5. nginx и HTTPS

```bash
sudo cp /opt/aquastone/aquastone-managment/deploy/nginx.conf /etc/nginx/sites-available/aquastone
# замените crm.aquastone.ru на свой домен в этом файле
sudo ln -s /etc/nginx/sites-available/aquastone /etc/nginx/sites-enabled/
sudo certbot certonly --nginx -d crm.aquastone.ru
sudo nginx -t && sudo systemctl reload nginx
```

Проверка: `https://crm.aquastone.ru/api/health` отвечает `{"database":"connected"}`.

Сервер API слушает только `127.0.0.1` и доверяет заголовку `X-Forwarded-For` только от nginx на этой же машине — подделать адрес и обойти ограничение попыток входа и заявок нельзя. Если nginx стоит на другой машине, укажите её адрес в `.env`: `TRUST_PROXY=10.0.0.5`.

## 6. Резервные копии

```bash
sudo mkdir -p /var/backups/aquastone && sudo chown aquastone /var/backups/aquastone
chmod +x /opt/aquastone/aquastone-managment/deploy/backup.sh
sudo -u aquastone crontab -e
# добавить строку:
15 3 * * * /opt/aquastone/aquastone-managment/deploy/backup.sh >> /var/backups/aquastone/backup.log 2>&1
```

Каждую ночь: дамп базы (хранится 14 дней) и копия папки вложений. **Настройте копирование `/var/backups/aquastone` на другой сервер или в облако** (строка `rclone` в `deploy/backup.sh`): копия на том же диске не спасёт, если диск выйдет из строя.

Проверьте хотя бы раз, что из копии можно восстановиться (на тестовой базе).

### Восстановление из копии

```bash
sudo systemctl stop aquastone-api
sudo -u postgres dropdb aquastone && sudo -u postgres createdb -O aquastone aquastone
pg_restore --no-owner -h 127.0.0.1 -U aquastone -d aquastone /var/backups/aquastone/db/aquastone-ДАТА.dump
rsync -a /var/backups/aquastone/uploads/current/ /opt/aquastone/aquastone-managment/uploads/
sudo systemctl start aquastone-api
```

## 7. Обновление

```bash
sudo -u aquastone -i
cd aquastone-managment && git pull && npm ci && npm test && npm run build
sudo rsync -a --delete dist/ /var/www/aquastone/management/
sudo systemctl restart aquastone-api
# конструктор:
cd ../aquastone-constructor && git pull && npm ci && CONSTRUCTOR_BASE=/constructor/ npm run build
sudo rsync -a --delete dist/ /var/www/aquastone/constructor/
```

## Цены конструктора

Цены материалов, коэффициенты толщины, цены вырезов и коэффициенты форм — в `server/calc/pricing.js`.
После изменения: `sudo systemctl restart aquastone-api`. Пересобирать конструктор не нужно — он получает расчёт от сервера.

## Важно

- `npm run seed` на рабочем сервере не запустится (`NODE_ENV=production`): он стирает все процессы.
- `npm run deploy` (GitHub Pages) публикует только демо-версию с данными в браузере — для работы она не подходит.
- Автотесты: `npm test`. На GitHub они запускаются сами при каждом push (`.github/workflows/ci.yml`).
