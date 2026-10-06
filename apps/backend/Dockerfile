# syntax=docker/dockerfile:1

# Build context: apps/backend
#
# Stages:
#   deps      all dependencies + generated Prisma client
#   build     compiled NestJS app (dist/)
#   prod-deps runtime dependencies only
#   migrate   one-shot image that applies Prisma migrations (keeps the CLI out of the runtime image)
#   runtime   the API server (default target)

FROM node:24-bookworm-slim AS deps
WORKDIR /app
# The Prisma schema engine used by `prisma migrate deploy` needs OpenSSL.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
# `npm ci` runs the postinstall hook (`prisma generate`), which needs the schema and config.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: the postinstall hook needs the Prisma CLI, which is a dev dependency.
# The generated client is already compiled into dist/ by the build stage.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM deps AS migrate
# DATABASE_URL is supplied at run time; nothing secret is baked into the image.
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app
# package.json marks the compiled output as ESM ("type": "module").
COPY --chown=node:node package.json ./
COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
USER node
EXPOSE 3001
# DATABASE_URL, CORS_ORIGIN, ANTHROPIC_API_KEY, ANTHROPIC_MODEL and MEETING_ANALYZER
# are read from the environment at run time.
CMD ["node", "dist/main.js"]
