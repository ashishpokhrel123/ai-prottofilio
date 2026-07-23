# ---- Build stage ----
FROM node:20-slim AS build
RUN corepack enable
WORKDIR /repo

COPY pnpm-workspace.yaml package.json turbo.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile=false

WORKDIR /repo/apps/web
RUN pnpm build

# ---- Runtime stage ----
FROM node:20-slim AS runtime
RUN corepack enable
WORKDIR /repo
COPY --from=build /repo ./
WORKDIR /repo/apps/web

ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "start"]
