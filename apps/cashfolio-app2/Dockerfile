# syntax = docker/dockerfile:1

ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="TanStack Start"

WORKDIR /app

ENV NODE_ENV="production"

# Install latest corepack to work around this issue: https://github.com/nodejs/corepack/issues/612
RUN npm install -g corepack@latest

RUN corepack enable pnpm

FROM base AS build

# Install packages needed to build node modules
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3

# Install node modules
COPY --link package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --link apps/cashfolio-app2/package.json apps/cashfolio-app2/
RUN pnpm --filter cashfolio-app2 install --prod=false --frozen-lockfile

# Copy application code
COPY --link apps/cashfolio-app2 apps/cashfolio-app2

RUN pnpm --filter cashfolio-app2 prisma:generate

# Build application
RUN pnpm --filter cashfolio-app2 build

# Remove development dependencies
RUN pnpm --dir apps/cashfolio-app2 prune --prod

FROM base

# Install openssl needed to run Prisma
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y openssl

# Copy built application
COPY --from=build /app /app

EXPOSE 3000
CMD [ "pnpm", "--filter", "cashfolio-app2", "exec", "vite", "preview", "--host", "0.0.0.0", "--port", "3000" ]
