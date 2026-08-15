# THRETHA COUTURE — Production Dockerfile
# Next.js standalone + MongoDB Atlas + Cloudinary

# ============================================
# 1. Dependencies
# ============================================
FROM node:20-alpine AS deps

WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./

RUN npm ci


# ============================================
# 2. Build
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

COPY . .

# Create public directory because the original
# public folder is no longer in the repository.
RUN mkdir -p public

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build


# ============================================
# 3. Production
# ============================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Public directory
COPY --from=builder /app/public ./public

# Next.js standalone server
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Next.js static files
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
