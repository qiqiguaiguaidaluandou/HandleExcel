# Multi-stage Dockerfile for backend
#   base : 系统依赖 + Python 依赖（含 docker CLI，用来调 socket 起兄弟执行器容器）
#   dev  : 开发镜像，源码 bind mount，uvicorn --reload
#   prod : 生产镜像，源码 COPY 进去，多 worker，无 reload

FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

# docker CLI 用来通过挂进来的 /var/run/docker.sock 起 executor 兄弟容器。
# 只装 cli，不装 daemon；ca-certificates 是 openai 客户端调 HTTPS 需要的。
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        docker.io \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# --------- dev ---------
FROM base AS dev
# dev 模式下源码由 docker-compose 以 bind mount 的方式挂进 /app/app，
# 这里不 COPY 源码，避免和挂载冲突。
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002", "--reload"]

# --------- prod ---------
FROM base AS prod
COPY app ./app
COPY migrate_paths.py ./migrate_paths.py
# 单 worker 默认够小体量用；要多 worker 通过 compose command 覆盖
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002", "--workers", "2"]
