# Multi-stage Dockerfile for frontend (Next.js 16)
#   deps   : 只装依赖，供后面 stage 复用
#   dev    : 开发镜像，源码 bind mount，next dev
#   builder: 构建 standalone 产物
#   prod   : 生产运行镜像，只拷 standalone + static + public，体积最小

# ---------- deps ----------
FROM node:20-alpine AS deps
WORKDIR /app
# Next.js 对 Alpine 的 musl 有时会缺 glibc 符号，装个 libc6-compat 保险
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

# ---------- dev ----------
FROM node:20-alpine AS dev
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
# 源码由 docker-compose 以 bind mount 的方式挂入 /app，这里不 COPY 业务代码
EXPOSE 3001
CMD ["npm", "run", "dev"]

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

# ---------- prod ----------
FROM node:20-alpine AS prod
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001 \
    HOSTNAME=0.0.0.0

# 创建非 root 用户运行
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# standalone 输出的最小运行集合
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3001
CMD ["node", "server.js"]
