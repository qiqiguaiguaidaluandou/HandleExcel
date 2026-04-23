# Executor 沙箱镜像：只装用户代码需要的纯数据处理库，不装网络/系统工具。
# 每次 /api/execute 由后端通过 `docker run --rm` 拉起一次性容器跑用户代码，
# 容器参数会另外加 --network none --read-only --memory --cpus 等硬隔离。
FROM python:3.11-slim

# 关闭 pip 缓存 / 字节码，尽量减小镜像和运行时副作用
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/ \
    PIP_TRUSTED_HOST=mirrors.aliyun.com \
    PIP_DEFAULT_TIMEOUT=120

# 说明：这里不复制任何应用代码。用户代码由 backend 每次挂成 /app/run.py。
# 也不创建工作目录以外的东西，容器 rootfs 会被 --read-only 锁住。
WORKDIR /app

RUN pip install --no-cache-dir \
    "pandas==2.2.3" \
    "numpy>=1.26,<3" \
    "openpyxl==3.1.5" \
    "xlrd==2.0.1"

# 入口由 docker run 的 CMD 覆盖为 python /app/run.py；这里只留兜底
CMD ["python", "-c", "print('executor image ready')"]
