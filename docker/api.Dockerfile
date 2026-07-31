# syntax=docker/dockerfile:1
#
# Production image for the NestJS API and its ingestion worker.
#
# Multi-stage: the build stage carries the full toolchain and dev dependencies,
# the runtime stage carries only production dependencies and compiled output.
# The result is a fraction of the size with a far smaller attack surface.
#
# Build from the repository root:
#   docker build -f docker/api.Dockerfile -t ai-portfolio-api .

# ---------- Stage 1: dependencies ----------
FROM node:20-slim AS deps
# OpenSSL is required by Prisma's query engine, not optional.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.6.0 --activate
WORKDIR /repo

# Manifests only, so this layer stays cached until a dependency truly changes.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/

RUN pnpm install --frozen-lockfile --ignore-scripts

# ---------- Stage 2: build ----------
FROM deps AS build
WORKDIR /repo
COPY packages ./packages
COPY apps/api ./apps/api

WORKDIR /repo/apps/api
RUN pnpm exec prisma generate && pnpm exec nest build

# Strip dev dependencies in place; the runtime stage copies the result.
WORKDIR /repo
RUN pnpm prune --prod

# Re-generate after pruning. The Prisma client is not a package but an
# artefact written *inside* node_modules, and pruning rebuilds that tree —
# which silently removes it. This is why `prisma` is a prod dependency: the
# runtime also shells out to its CLI for `migrate deploy`.
WORKDIR /repo/apps/api
RUN pnpm exec prisma generate

# ---------- Stage 3: runtime ----------
FROM node:20-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates dumb-init \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    API_PORT=4000 \
    UPLOAD_DIR=/data/uploads

WORKDIR /repo

COPY --from=build /repo/node_modules          ./node_modules
COPY --from=build /repo/packages              ./packages
COPY --from=build /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/apps/api/dist         ./apps/api/dist
COPY --from=build /repo/apps/api/prisma       ./apps/api/prisma
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY knowledge                                ./apps/api/knowledge

# Uploads live on a mounted volume; without one they vanish on redeploy.
RUN mkdir -p /data/uploads && chown -R node:node /data /repo

# Never run as root: a container escape then starts from an unprivileged user.
USER node
WORKDIR /repo/apps/api

EXPOSE 4000

# dumb-init reaps zombies and forwards SIGTERM, so Nest's shutdown hooks
# actually run instead of the process being killed outright.
ENTRYPOINT ["dumb-init", "--"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/src/main.js"]
