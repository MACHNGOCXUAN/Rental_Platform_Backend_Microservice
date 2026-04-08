FROM node:22-alpine AS base

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

FROM base AS deps
RUN apk add --no-cache \
	libc6-compat \
	openssl \
	python3 \
	make \
	g++ \
	chromium \
	nss \
	freetype \
	harfbuzz \
	ca-certificates \
	ttf-freefont \
	ttf-dejavu \
	&& if [ -x /usr/bin/chromium-browser ]; then ln -sf /usr/bin/chromium-browser /usr/bin/chromium; elif [ -x /usr/bin/chromium ]; then ln -sf /usr/bin/chromium /usr/bin/chromium-browser; else echo "Chromium binary not found" && exit 1; fi
COPY package.json ./
COPY package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund

FROM base AS builder
RUN apk add --no-cache \
	libc6-compat \
	openssl \
	chromium \
	nss \
	freetype \
	harfbuzz \
	ca-certificates \
	ttf-freefont \
	ttf-dejavu \
	&& if [ -x /usr/bin/chromium-browser ]; then ln -sf /usr/bin/chromium-browser /usr/bin/chromium; elif [ -x /usr/bin/chromium ]; then ln -sf /usr/bin/chromium /usr/bin/chromium-browser; else echo "Chromium binary not found" && exit 1; fi
ENV DATABASE_URL=postgresql://localhost:5432/dummy
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npx nest build
RUN if [ -d src/protos ]; then mkdir -p dist/src/protos && cp -R src/protos/. dist/src/protos/; fi
RUN npm prune --omit=dev

FROM node:22-alpine AS runner
RUN apk add --no-cache \
	libc6-compat \
	openssl \
	wget \
	chromium \
	nss \
	freetype \
	harfbuzz \
	ca-certificates \
	ttf-freefont \
	ttf-dejavu \
	&& if [ -x /usr/bin/chromium-browser ]; then ln -sf /usr/bin/chromium-browser /usr/bin/chromium; elif [ -x /usr/bin/chromium ]; then ln -sf /usr/bin/chromium /usr/bin/chromium-browser; else echo "Chromium binary not found" && exit 1; fi
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S nodejs && adduser -S nestjs -G nodejs
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/prisma ./prisma
RUN chown -R nestjs:nodejs /app
USER nestjs
EXPOSE 9002 50052
CMD ["node", "dist/src/main"]