# ---------- BASE ----------
FROM node:20-bookworm-slim AS base
WORKDIR /app

# ---------- DEPENDENCIES (with dev deps for build) ----------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---------- BUILD ----------
FROM base AS build
COPY package.json package-lock.json tsconfig.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
RUN npm run build

# ---------- PRODUCTION RUNTIME ----------
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY migrations ./migrations

RUN useradd --create-home --uid 10001 appuser
USER appuser

EXPOSE 4000

CMD ["sh", "-c", "node dist/runMigrations.js && node dist/server.js"]
