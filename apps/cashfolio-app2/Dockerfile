# syntax = docker/dockerfile:1

ARG NODE_VERSION=24.21.0
ARG DOTENV_VERSION=18.0.6
ARG PRISMA_VERSION=7.10.0
ARG PNPM_VERSION=12.11.1
ARG COREPACK_VERSION=0.36.0
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="TanStack Start"

WORKDIR /app

ENV NODE_ENV="production"

FROM base AS build

ARG COREPACK_VERSION

# Install packages needed to generate Prisma client and build the application.
RUN --mount=type=cache,id=apt-cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,id=apt-lists,target=/var/lib/apt/lists,sharing=locked \
    apt-get update -qq && \
    apt-get install --no-install-recommends -y openssl

# npm is used only to bootstrap the pinned Corepack before pnpm is available.
# This works around Corepack signature issues: https://github.com/nodejs/corepack/issues/612
RUN npm install -g corepack@${COREPACK_VERSION}
RUN corepack enable pnpm

# Install node modules
COPY --link package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --link apps/cashfolio-app2/package.json apps/cashfolio-app2/
RUN pnpm config set store-dir /pnpm/store
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm --filter cashfolio-app2 install --prod=false --frozen-lockfile

# Copy application code
COPY --link apps/cashfolio-app2 apps/cashfolio-app2

RUN pnpm --filter cashfolio-app2 prisma:generate

# Build application
RUN pnpm --filter cashfolio-app2 build
RUN pnpm --filter cashfolio-app2 build:staging-seed
RUN pnpm --filter cashfolio-app2 build:provider-usage-cleanup

FROM base AS migration-tools

ARG COREPACK_VERSION
ARG DOTENV_VERSION
ARG PNPM_VERSION
ARG PRISMA_VERSION

# Select the same schema-engine OpenSSL target as the final runtime image.
RUN --mount=type=cache,id=apt-cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,id=apt-lists,target=/var/lib/apt/lists,sharing=locked \
    apt-get update -qq && \
    apt-get install --no-install-recommends -y openssl

# npm is used only to bootstrap the pinned Corepack before pnpm is available.
RUN npm install -g corepack@${COREPACK_VERSION}
RUN corepack enable pnpm && corepack prepare pnpm@${PNPM_VERSION} --activate
# Share the reviewed release-age, build-script, and security override policy.
COPY --link pnpm-workspace.yaml ./
RUN echo '{"private":true}' > package.json
RUN pnpm add --workspace-root --prod \
    --allow-build=@prisma/engines \
    --allow-build=prisma \
    dotenv@${DOTENV_VERSION} \
    prisma@${PRISMA_VERSION}

FROM base

# Install openssl needed to run Prisma
RUN --mount=type=cache,id=apt-cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,id=apt-lists,target=/var/lib/apt/lists,sharing=locked \
    apt-get update -qq && \
    apt-get install --no-install-recommends -y openssl

# Copy built application
COPY --from=build /app/apps/cashfolio-app2/.output .output
COPY --from=build /app/package.json package.json
COPY --from=build /app/apps/cashfolio-app2/package.json apps/cashfolio-app2/package.json

# Copy the release-command payload for migrations and staging-only seeding.
COPY --from=migration-tools /app/node_modules node_modules
COPY --from=build /app/apps/cashfolio-app2/prisma apps/cashfolio-app2/prisma
COPY --from=build /app/apps/cashfolio-app2/prisma.config.ts apps/cashfolio-app2/prisma.config.ts
COPY --from=build /app/apps/cashfolio-app2/scripts/prisma-migrate-deploy-with-retry.sh apps/cashfolio-app2/scripts/prisma-migrate-deploy-with-retry.sh
COPY --from=build /app/apps/cashfolio-app2/scripts/release-staging.sh apps/cashfolio-app2/scripts/release-staging.sh
COPY --from=build /app/apps/cashfolio-app2/dist/staging-seed apps/cashfolio-app2/dist/staging-seed
COPY --from=build /app/apps/cashfolio-app2/dist/provider-usage-cleanup apps/cashfolio-app2/dist/provider-usage-cleanup

EXPOSE 3000
CMD [ "node", ".output/server/index.mjs" ]
