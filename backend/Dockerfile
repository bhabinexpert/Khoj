# Khoj backend — public job API + CV/match proxy.
#
# Single stage: the runtime dependency tree is small (no native builds beyond
# what npm ships prebuilt), so a builder stage would only add complexity.
FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    PORT=5000

WORKDIR /app

# Copy manifests first so `npm ci` is cached until dependencies actually change.
COPY package.json package-lock.json ./
# --omit=dev drops jest/supertest/mongodb-memory-server (~200 MB of test tooling).
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# The node image ships an unprivileged `node` user (uid 1000).
USER node

EXPOSE 5000

# /health does not touch MongoDB, so this stays a liveness check rather than a
# readiness check for the database.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5000/health >/dev/null 2>&1 || exit 1

CMD ["node", "src/server.js"]
