#!/usr/bin/env bash
# Резервная копия AquaStone: база PostgreSQL и папка вложений (фотоотчёты, чертежи).
# Запуск каждую ночь (cron пользователя aquastone):
#   15 3 * * * /opt/aquastone/aquastone-managment/deploy/backup.sh >> /var/log/aquastone-backup.log 2>&1
#
# Копии лежат в BACKUP_DIR и хранятся KEEP_DAYS дней. Обязательно копируйте BACKUP_DIR и на другой
# сервер или в облако (например, rclone в Яндекс Object Storage) — копия на том же диске не спасёт при его поломке.
# Восстановление — см. DEPLOY.md, раздел «Восстановление из копии».
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/aquastone/aquastone-managment}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/aquastone}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y-%m-%d_%H%M)"

# Параметры базы — из того же .env, что и у сервера.
set -a; [ -f "$APP_DIR/.env" ] && . "$APP_DIR/.env"; set +a
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-postgres}" PGPASSWORD="${PGPASSWORD:-}"
DB="${PGDATABASE:-aquastone}"

mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/uploads"

# 1. База: сжатый дамп в формате pg_restore.
pg_dump --format=custom --no-owner --file="$BACKUP_DIR/db/aquastone-$STAMP.dump" "$DB"

# 2. Вложения: файлы не меняются после загрузки, поэтому копируем только новые (rsync),
#    а удалённые из системы файлы храним ещё KEEP_DAYS дней в папке deleted-<дата>.
rsync -a --delete --backup --backup-dir="$BACKUP_DIR/uploads-deleted/$STAMP" "$APP_DIR/uploads/" "$BACKUP_DIR/uploads/current/"

# 3. Старые копии удаляем.
find "$BACKUP_DIR/db" -name 'aquastone-*.dump' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR/uploads-deleted" -mindepth 1 -maxdepth 1 -type d -mtime +"$KEEP_DAYS" -exec rm -rf {} + 2>/dev/null || true

# 4. Копия на другой сервер или в облако — раскомментируйте и настройте (rclone config):
# rclone sync "$BACKUP_DIR" "yandex-s3:aquastone-backups" --quiet

echo "$(date '+%F %T') резервная копия готова: $BACKUP_DIR/db/aquastone-$STAMP.dump"
