"""Настоящие связи между таблицами (внешние ключи).

В базе почти все связи были «на честном слове»: в мэтче лежал id смены
обычной строкой, и база разрешала записать туда что угодно. Пока всё пишет
только наш код, это незаметно — до первой ошибки в коде, ручной правки в
админке или гонки при удалении. Тогда появляется мэтч без смены, сообщение
без мэтча или начисление без заведения: строка есть, а того, на что она
ссылается, нет. Человек видит пустой экран, а в логах ни одной ошибки.

Теперь база проверяет это сама. Что НЕ стало внешним ключом и почему:
- `messages.sender_id` — у системных сообщений там слово «system»;
- `swipes.target_id`, `reviews.rater_id`, `reports.target_id` — это id либо
  человека, либо заведения (две разные таблицы), одной ссылкой не описать.

На SQLite (разработка и тесты) ничего не делаем: там внешние ключи по
умолчанию не проверяются вовсе, а перестройка таблиц ради незаметной записи
в схеме — лишний риск. Прод работает на PostgreSQL, и проверяет их он.

Revision ID: b1c2d3e4f5a6
Revises: a5b6c7d8e9f0
"""
from alembic import op

revision = "b1c2d3e4f5a6"
down_revision = "a5b6c7d8e9f0"
branch_labels = None
depends_on = None

# (имя связи, таблица, поле, на какую таблицу ссылается)
_LINKS = [
    ("fk_matches_user", "matches", "user_id", "users"),
    ("fk_matches_employer", "matches", "employer_id", "employers"),
    ("fk_matches_vacancy", "matches", "vacancy_id", "vacancies"),
    ("fk_messages_match", "messages", "match_id", "matches"),
    ("fk_reviews_match", "reviews", "match_id", "matches"),
    ("fk_commissions_match", "commissions", "match_id", "matches"),
    ("fk_commissions_employer", "commissions", "employer_id", "employers"),
]


def upgrade() -> None:
    if op.get_bind().dialect.name == "sqlite":
        return
    for name, table, column, parent in _LINKS:
        # Перед проверкой убираем «висячие» строки — те, что ссылаются в
        # пустоту. Без этого миграция просто не применится, и обновление
        # сервера остановится на полпути. Такие строки всё равно нерабочие:
        # приложение их не показывает (объекта, на который они ссылаются,
        # не существует).
        op.execute(
            f"DELETE FROM {table} WHERE {column} IS NOT NULL "
            f"AND {column} NOT IN (SELECT id FROM {parent})"
        )
        op.create_foreign_key(name, table, parent, [column], ["id"])


def downgrade() -> None:
    if op.get_bind().dialect.name == "sqlite":
        return
    for name, table, _column, _parent in _LINKS:
        op.drop_constraint(name, table, type_="foreignkey")
