#!/usr/bin/env bash
# Резервная копия базы StaffSwipe.
#
# Зачем: весь бизнес живёт в одном контейнере Postgres на одном сервере —
# мэтчи, переписка, балансы заведений и начисленная комиссия. Диск сервера
# или ошибочная команда стирают всё это без следа, а долги заведений после
# этого не восстановить ничем.
#
# Запуск вручную (из каталога с docker-compose.prod.yml):
#     bash scripts/backup.sh
#
# Каждую ночь (см. docs/DEPLOY.md, раздел «Бэкапы»):
#     0 4 * * * cd /root/sraffswipe1 && bash scripts/backup.sh >> /var/log/staffswipe-backup.log 2>&1
#
# Восстановление — в том же разделе DEPLOY.md.
set -euo pipefail

DIR="${BACKUP_DIR:-/var/backups/staffswipe}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
COMPOSE="${COMPOSE_FILE:-docker-compose.prod.yml}"
STAMP="$(date +%Y-%m-%d_%H%M)"
FILE="$DIR/staffswipe_$STAMP.sql.gz"

mkdir -p "$DIR"

# Дамп снимается внутри контейнера: на хосте psql может не стоять вовсе.
# --clean --if-exists — чтобы восстановление на непустую базу не спотыкалось.
docker compose -f "$COMPOSE" exec -T db \
  pg_dump -U staffswipe --clean --if-exists staffswipe | gzip -9 > "$FILE"

# Пустой или обрезанный дамп хуже отсутствия бэкапа: он создаёт ложное
# спокойствие. Проверяем, что архив читается целиком и содержит таблицы.
if ! gzip -t "$FILE" 2>/dev/null; then
  echo "ОШИБКА: архив $FILE битый, удаляю" >&2
  rm -f "$FILE"
  exit 1
fi
if ! zcat "$FILE" | grep -q "CREATE TABLE public.users"; then
  echo "ОШИБКА: в дампе $FILE нет таблицы users — база пустая или дамп не удался" >&2
  rm -f "$FILE"
  exit 1
fi

SIZE="$(du -h "$FILE" | cut -f1)"
echo "$(date '+%Y-%m-%d %H:%M') OK: $FILE ($SIZE)"

# Чистим старое, чтобы диск сервера не кончился молча.
find "$DIR" -name 'staffswipe_*.sql.gz' -type f -mtime "+$KEEP_DAYS" -print -delete

# Копия на самом сервере не спасает от гибели самого сервера. Если задан
# RCLONE_REMOTE (например «yadisk:staffswipe»), выкладываем копию наружу.
if [ -n "${RCLONE_REMOTE:-}" ] && command -v rclone >/dev/null 2>&1; then
  rclone copy "$FILE" "$RCLONE_REMOTE" && echo "Копия отправлена в $RCLONE_REMOTE"
elif [ -n "${RCLONE_REMOTE:-}" ]; then
  echo "ВНИМАНИЕ: RCLONE_REMOTE задан, но rclone не установлен — копия только локальная" >&2
fi
