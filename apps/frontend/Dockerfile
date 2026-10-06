# syntax=docker/dockerfile:1

# Build context: apps/frontend
#
# Stages:
#   build    production Angular build (dist/frontend/browser)
#   runtime  nginx serving the static files (default target)
#
# The bundle calls the API at http://localhost:3001/api (see src/app/api.config.ts),
# so the browser talks to the backend directly; nginx does not proxy.

FROM node:24-bookworm-slim AS build
ENV NG_CLI_ANALYTICS=false
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:stable-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
EXPOSE 80
