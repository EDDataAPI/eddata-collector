# Multi-stage build for optimal image size
FROM node:24.11.0-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci --only=production

# Production stage
FROM node:24.11.0-alpine

# Install runtime dependencies for better-sqlite3 and zeromq
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    libzmq \
    zeromq-dev

# Create app user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy application files
COPY --chown=nodejs:nodejs . .

# Create necessary directories with correct permissions
RUN mkdir -p /app/ardent-data/cache && \
    mkdir -p /app/ardent-backup && \
    mkdir -p /app/ardent-downloads && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port (default 3002)
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start application
CMD ["npm", "start"]
