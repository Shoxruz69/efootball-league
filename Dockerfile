# Production Dockerfile for 24/7 eFootball Telegram Bot & Mini App
FROM node:22-bullseye-slim AS base

# Install build dependencies for better-sqlite3 and curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy application source code
COPY . .

# Ensure data, uploads, and logs directories exist
RUN mkdir -p /app/data /app/uploads /app/logs

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose server port
EXPOSE 3000

# Health check to ensure 24/7 uptime monitoring
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health/ping || exit 1

# Start server
CMD ["node", "server/index.js"]
