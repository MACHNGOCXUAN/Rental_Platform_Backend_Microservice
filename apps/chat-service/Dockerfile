FROM node:22-alpine AS base

WORKDIR /app

FROM base AS deps
RUN apk add --no-cache libc6-compat openssl python3 make g++
COPY package.json ./
COPY package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund

FROM base AS builder
RUN apk add --no-cache libc6-compat openssl
ENV DATABASE_URL=mongodb://localhost:27017/dummy
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npx nest build
RUN if [ -d src/protos ]; then mkdir -p dist/src/protos && cp -R src/protos/. dist/src/protos/; fi
RUN npm prune --omit=dev

FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat openssl wget
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S nodejs && adduser -S nestjs -G nodejs
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
RUN chown -R nestjs:nodejs /app
USER nestjs
EXPOSE 9003 50053
CMD ["node", "dist/src/main"]