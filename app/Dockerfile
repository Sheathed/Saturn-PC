# syntax=docker/dockerfile:1

ARG NODE_VERSION=18
FROM node:${NODE_VERSION}-slim AS base
ENV NODE_OPTIONS=--openssl-legacy-provider
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    build-essential \
    git \
    ca-certificates \
    libssl-dev \
 && rm -rf /var/lib/apt/lists/*

FROM base AS builder

COPY --link package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY --link . .

WORKDIR /app/client
COPY --link client/package.json client/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci
RUN npm run build

FROM node:${NODE_VERSION}-slim AS final
ENV NODE_OPTIONS=--openssl-legacy-provider
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    build-essential \
    git \
    ca-certificates \
    libssl-dev \
 && rm -rf /var/lib/apt/lists/*

RUN addgroup --system --gid 1001 saturn \
 && adduser --system --uid 1001 --ingroup saturn --home /home/saturn saturn

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/main.js ./main.js
COPY --from=builder /app/background.js ./background.js
COPY --from=builder /app/src ./src
COPY --from=builder /app/assets ./assets
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/client/public ./client/public

RUN --mount=type=cache,target=/root/.npm \
    npm ci --only=production

ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=4096"

RUN chown -R saturn:saturn /app
USER saturn

EXPOSE 10069
CMD ["node", "main.js"]
