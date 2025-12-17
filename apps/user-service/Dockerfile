# ===== BASE =====
FROM node:lts-alpine AS base

# ===== DEPENDENCIES =====
FROM base AS deps
RUN apk add --no-cache libc6-compat wget openssl
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Install dependencies (exact versions)
RUN npm ci

# ===== BUILDER =====
FROM base AS builder
RUN apk add --no-cache wget openssl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client & proto
RUN npm run prisma:generate
RUN npm run proto:generate

# Build NestJS
RUN npm run build

# ===== RUNNER (PRODUCTION) =====
FROM base AS runner
RUN apk add --no-cache wget openssl
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/protos ./src/protos
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json

# Copy node_modules
COPY --from=deps /app/node_modules ./node_modules

# Permissions
RUN chown -R nestjs:nodejs /app
USER nestjs

# Expose ports
EXPOSE 9001 50051

CMD ["npm", "run", "start"]