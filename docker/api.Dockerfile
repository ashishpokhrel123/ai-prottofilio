# ---- Build stage ----
FROM node:20-slim AS build
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

COPY pnpm-workspace.yaml package.json turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile=false

WORKDIR /repo/apps/api
RUN pnpm prisma generate && pnpm build

# ---- Runtime stage ----
FROM node:20-slim AS runtime
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/api ./apps/api
WORKDIR /repo/apps/api

ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "dist/main.js"]
