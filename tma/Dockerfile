# Сборка статики Mini App и раздача через nginx.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Vite «запекает» VITE_*-переменные в бандл на этапе сборки. По умолчанию —
# mock-режим (локальное превью без backend). Прод-значения (реальный API,
# домен, ссылки на оферту/политику) передаёт docker compose через build args.
ARG VITE_USE_BACKEND=false
ARG VITE_API_BASE_URL=http://localhost:8000
ARG VITE_OFFER_URL=
ARG VITE_PRIVACY_URL=
ARG VITE_SUPPORT_URL=
ENV VITE_USE_BACKEND=$VITE_USE_BACKEND \
    VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_OFFER_URL=$VITE_OFFER_URL \
    VITE_PRIVACY_URL=$VITE_PRIVACY_URL \
    VITE_SUPPORT_URL=$VITE_SUPPORT_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
