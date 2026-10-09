# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS build
ARG SERVICE
ARG NPM_REGISTRY=https://registry.npmjs.org/
ENV npm_config_registry=${NPM_REGISTRY}
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY services/ledger/package.json services/ledger/
COPY services/daily-balance/package.json services/daily-balance/
RUN --mount=type=cache,target=/root/.npm \
  npm ci --no-audit --no-fund --fetch-retries=5 --fetch-retry-mintimeout=20000
COPY packages/contracts packages/contracts
COPY services/${SERVICE} services/${SERVICE}
RUN npm run build -w packages/contracts \
  && npm run build -w services/${SERVICE} \
  && npm prune --omit=dev --no-audit --no-fund

FROM node:22-alpine AS runtime
ARG SERVICE
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build --chown=node:node /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build --chown=node:node /app/services/${SERVICE}/package.json ./package.json
COPY --from=build --chown=node:node /app/services/${SERVICE}/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health/live || exit 1
CMD ["node", "--import", "./dist/telemetry.js", "dist/main.js"]
