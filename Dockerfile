# ---------- BASE ----------
FROM node:20-slim AS base
WORKDIR /app


# ---------- DEPENDENCIES ----------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci


# ---------- BUILD ----------
FROM base AS build
COPY package.json package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.json ./
COPY src ./src
RUN npm run build


# ---------- RUNTIME ----------
FROM base AS runtime
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

RUN useradd --create-home --uid 10001 appuser
USER appuser

EXPOSE 4000

CMD ["sh", "-c", "npm run migrate && npm run start"]
