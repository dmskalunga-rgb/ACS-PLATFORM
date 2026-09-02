FROM node:24.19.0-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.16.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY services/platform-api ./services/platform-api
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @acs/platform-api... build
RUN pnpm --filter @acs/platform-api deploy --prod /runtime

FROM node:24.19.0-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk upgrade --no-cache libcrypto3 libssl3 \
    && rm -rf \
      /usr/local/lib/node_modules/npm \
      /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm \
      /usr/local/bin/npx \
      /usr/local/bin/corepack \
      /usr/local/bin/pnpm \
      /usr/local/bin/pnpx \
    && addgroup -S acs \
    && adduser -S -G acs -u 10001 acs
COPY --from=build --chown=acs:acs /runtime ./
USER acs
EXPOSE 3000
CMD ["node", "dist/server.js"]
