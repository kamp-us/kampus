# Build context: monorepo root
FROM node:22-slim AS base
RUN apt-get update && apt-get install -y python3 make g++ bash git --no-install-recommends && rm -rf /var/lib/apt/lists/*
RUN corepack enable

FROM base AS build
WORKDIR /monorepo
COPY pnpm-lock.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm --filter wormhole deploy /app

FROM base AS runtime
ENV PORT=8787
EXPOSE 8787
WORKDIR /app
COPY --from=build /app .
USER node
CMD ["node", "node_modules/.bin/tsx", "src/server.ts"]
