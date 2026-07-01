#!/usr/bin/env sh
# Генерирует случайные секреты для прод-конфига StaffSwipe.
# Значения НЕ сохраняются в файл — скопируйте их в свой .env вручную.
#
#   bash scripts/gen-secrets.sh
#
# Требуется openssl (есть почти везде). Каждый секрет — 32 случайных байта в hex.

gen() {
  openssl rand -hex 32
}

echo "# Вставьте в .env (значения одноразовые, храните в секрете):"
echo "POSTGRES_PASSWORD=$(gen)"
echo "JWT_SECRET=$(gen)"
echo "INTERNAL_API_SECRET=$(gen)"
