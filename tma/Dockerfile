# Сборка статики Mini App и раздача через nginx.
#
# Контекст сборки — КОРЕНЬ репозитория, а не каталог tma. Так пришлось
# сделать, потому что страницы оферты и политики собираются из docs/legal/
# (см. scripts/build-legal.mjs) — то есть из файлов, лежащих выше tma. Пока
# контекстом был ./tma, этих файлов в сборке просто не было: `npm run build`
# падал с ENOENT, образ не собирался, и сайт не поднимался вообще — при том
# что локально всё собиралось нормально. Внутри образа повторяем раскладку
# репозитория, чтобы относительный путь в скрипте остался прежним.
FROM node:22-alpine AS build
WORKDIR /repo/tma
COPY tma/package.json tma/package-lock.json ./
RUN npm ci
# Исходники юридических документов — до сборки: из них делаются /legal/*.html.
COPY docs/legal /repo/docs/legal
COPY tma/ ./
# Vite «запекает» VITE_*-переменные в бандл на этапе сборки. По умолчанию —
# mock-режим (локальное превью без backend). Прод-значения (реальный API,
# домен, ссылки на оферту/политику) передаёт docker compose через build args.
ARG VITE_USE_BACKEND=false
ARG VITE_API_BASE_URL=http://localhost:8000
ARG VITE_OFFER_URL=
ARG VITE_PRIVACY_URL=
ARG VITE_SUPPORT_URL=
# Имя бота нужно ссылкам «поделиться сменой» и рекламным ссылкам в админке.
# Без него они вели на запасное `staffswipe_bot` — то есть в чужого бота.
ARG VITE_BOT_USERNAME=staffswipe_bot
# Отчёты об ошибках приложения. Без этой строки Sentry работал только на
# сервере, а падения в самом приложении не приходили никуда.
ARG VITE_SENTRY_DSN=
ENV VITE_USE_BACKEND=$VITE_USE_BACKEND \
    VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_OFFER_URL=$VITE_OFFER_URL \
    VITE_PRIVACY_URL=$VITE_PRIVACY_URL \
    VITE_SUPPORT_URL=$VITE_SUPPORT_URL \
    VITE_BOT_USERNAME=$VITE_BOT_USERNAME \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /repo/tma/dist /usr/share/nginx/html
EXPOSE 80
