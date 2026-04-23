# 生产镜像：build 产出 standalone，runtime 只带最小 runtime 依赖。
#   deps    : 装 npm 依赖（供后面 stage 复用）
#   builder : next build 生成 .next/standalone
#   runtime : 只复制 standalone + public + static，体积最小

# ---------- deps ----------
FROM node:20-alpine AS deps
WORKDIR /app
# Next.js 在 Alpine 下需要 libc6-compat
RUN apk add --no-cache libc6-compat
# 国内网络慢/不稳时换国内 npm 源；不需要就注释掉
RUN npm config set registry https://registry.npmmirror.com
COPY package.json package-lock.json ./
RUN npm ci

# ---------- builder ----------
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* 会在 build 期被编译进前端包，必须在 build 时就传入
ARG NEXT_PUBLIC_API_BASE=http://localhost:8002
ENV NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE}
RUN npm run build

# ---------- runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001 \
    HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3001
CMD ["node", "server.js"]
