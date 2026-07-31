# syntax=docker/dockerfile:1
#
# Production image for the Next.js frontend.
#
# Uses Next's standalone output: the build traces the modules actually imported
# and emits a self-contained server, so the runtime stage needs no package
# manager and no workspace symlinks. Roughly 150MB instead of ~1GB.
#
# Build from the repository root:
#   docker build -f docker/web.Dockerfile -t ai-portfolio-web .

# ---------- Stage 1: dependencies ----------
FROM node:20-slim AS deps
RUN corepack enable && corepack prepare pnpm@9.6.0 --activate
WORKDIR /repo

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/

RUN pnpm install --frozen-lockfile --ignore-scripts

# ---------- Stage 2: build ----------
FROM deps AS build
WORKDIR /repo
COPY packages ./packages
COPY apps/web ./apps/web

# Baked into the client bundle at build time, so it must be present now rather
# than at container start. Left empty by default: the Docker stack serves the
# API on the same origin through Caddy, so a relative /api works.
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

WORKDIR /repo/apps/web
RUN pnpm exec next build

# ---------- Stage 3: runtime ----------
FROM node:20-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends dumb-init \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

# The standalone bundle reproduces the workspace layout it was traced from,
# so server.js ends up under apps/web/.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public

USER node
EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
