# Multi-stage production Dockerfile for Agent Research Network
# Builds API, Web, and MCP server in a single container

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat curl postgresql-client
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json package-lock.json turbo.json ./
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/mcp-server/package.json ./apps/mcp-server/
RUN npm ci

# Build shared packages and apps
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build all packages and apps
RUN npm run build

# Production API + MCP server
FROM base AS api
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api ./apps/api
COPY --from=builder /app/apps/mcp-server ./apps/mcp-server
COPY --from=builder /app/turbo.json ./
COPY --from=builder /app/package.json ./

# Runtime scripts
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["api"]

# Production Web (Next.js)
FROM base AS web
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/web ./apps/web
COPY --from=builder /app/turbo.json ./
COPY --from=builder /app/package.json ./

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["npm", "run", "start", "--workspace=@arn/web"]

# All-in-one for single-container deployments (Railway, Render)
FROM base AS all-in-one
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps ./apps
COPY --from=builder /app/turbo.json ./
COPY --from=builder /app/package.json ./

# Runtime scripts
COPY docker-entrypoint.sh /usr/local/bin/
COPY start-all.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh /usr/local/bin/start-all.sh

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3001/health && curl -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["all"]
