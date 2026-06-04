# Works with both `docker build` and `podman build`.
# (Podman also auto-detects a file named `Containerfile`; a symlink is provided.)
FROM docker.io/library/node:20-alpine

WORKDIR /app

# Install production dependencies first for better layer caching.
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# App source
COPY . .

# Run as the unprivileged built-in `node` user (uid 1000).
RUN mkdir -p /app/data && chown -R node:node /app
USER node

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/app/data

EXPOSE 8080

# Default command; compose overrides this per-service (server/worker/bot).
CMD ["node", "src/server.js"]
