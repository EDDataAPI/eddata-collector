# Multi-stage build for optimal image size and security
FROM node:24.11.0-alpine AS base

# Install system dependencies for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    libzmq \
    zeromq-dev \
    && rm -rf /var/cache/apk/*

# Build stage
FROM base AS builder

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install all dependencies (including devDependencies for building native modules)
RUN npm ci --include=dev && \
    npm rebuild better-sqlite3 zeromq && \
    npm prune --production && \
    npm cache clean --force

# Production stage
FROM base AS production

# Create app user for security
RUN addgroup -g 1001 -S eddata && \
    adduser -S eddata -u 1001 -G eddata

# Set working directory
WORKDIR /app

# Copy built node_modules from builder stage
COPY --from=builder --chown=eddata:eddata /app/node_modules ./node_modules

# Copy package files
COPY --chown=eddata:eddata package*.json ./

# Copy application files
COPY --chown=eddata:eddata . .

# Create necessary directories with correct permissions
RUN mkdir -p /app/eddata-data/cache && \
    mkdir -p /app/eddata-backup && \
    mkdir -p /app/eddata-downloads && \
    chown -R eddata:eddata /app

# Switch to non-root user
USER eddata

# Expose port (default 3002)
EXPOSE 3002

# Add labels for better maintainability
LABEL org.opencontainers.image.title="EDData Collector"
LABEL org.opencontainers.image.description="Elite Dangerous Data Collector for EDDN data"
LABEL org.opencontainers.image.vendor="EDDataAPI"
LABEL org.opencontainers.image.source="https://github.com/EDDataAPI/eddata-collector"

# Health check with more robust endpoint testing
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e " \
        const http = require('http'); \
        const options = { \
            hostname: 'localhost', \
            port: process.env.EDDATA_COLLECTOR_LOCAL_PORT || 3002, \
            path: '/health', \
            timeout: 5000 \
        }; \
        const req = http.request(options, (res) => { \
            process.exit(res.statusCode === 200 ? 0 : 1); \
        }); \
        req.on('error', () => process.exit(1)); \
        req.on('timeout', () => process.exit(1)); \
        req.end();" || exit 1

# Start application
CMD ["npm", "start"]
