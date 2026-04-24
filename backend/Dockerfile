# 生产镜像：源码 COPY 进去，多 worker，无 reload。
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/ \
    PIP_TRUSTED_HOST=mirrors.aliyun.com \
    PIP_DEFAULT_TIMEOUT=120

# docker CLI 用来通过挂进来的 /var/run/docker.sock 起 executor 兄弟容器
# 先把 Debian 软件源切到阿里云，避免国内从 deb.debian.org 拉 docker.io 超时
RUN set -eux \
    && if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
         sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources; \
       fi \
    && if [ -f /etc/apt/sources.list ]; then \
         sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list; \
       fi \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        docker.io \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY migrate_paths.py ./migrate_paths.py

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002", "--workers", "2"]
