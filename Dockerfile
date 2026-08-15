# ============================================
# THRETHA COUTURE
# Production Dockerfile
# Next.js + MongoDB Atlas + Cloudinary
# ============================================

# ============================================
# 1. Dependencies
# ============================================
FROM node:20-bookworm-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci


# ============================================
# 2. Build
# ============================================
FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

COPY . .

# Ensure public directory exists
RUN mkdir -p public

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build


# ============================================
# 3. Production
# ============================================
FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=10000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid 1001 nextjs

# Public files
COPY --from=builder /app/public ./public

# Next.js standalone server
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Static files
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 10000

CMD ["node", "server.js"]
