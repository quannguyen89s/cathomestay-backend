# ==========================================
# Stage 1: Build stage
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package manifests and install all dependencies (including devDependencies)
COPY package*.json ./
RUN npm ci

# Copy TypeScript config and source code
COPY tsconfig.json ./
COPY src ./src

# Compile TypeScript to JavaScript
RUN npm run build

# ==========================================
# Stage 2: Production runner
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled files from builder
COPY --from=builder /app/dist ./dist

# Run as non-root user for security
USER node

EXPOSE 5000

# Start server directly with Node for proper signal handling
CMD ["node", "dist/server.js"]
