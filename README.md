# HandleExcel

用 AI 处理 Excel 报表：上传文件 → 描述需求 → AI 生成 pandas 代码 → 审阅后执行 → 下载结果。

## 架构

- 后端：FastAPI（端口 8002），调用百炼 qwen-plus 生成代码，Docker 兄弟容器隔离执行
- 前端：Next.js 16 + Tailwind（端口 3001）
- 执行器：每次 `/execute` 起一次性 `handleexcel-executor` 容器，`--network none` + `--read-only` + rlimit + nobody

详细架构见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，Docker 化方案见 [docs/plan/docker-and-executor-sandbox.md](docs/plan/docker-and-executor-sandbox.md)。

## 前置要求

- Docker 20.10+（装了 docker 即可，daemon 跑起来）
- Docker Compose v2（`docker compose` 命令可用）

## 启动

### 1. 配置环境

```bash
cd backend
cp .env.example .env
# 编辑 .env，至少填入 DASHSCOPE_API_KEY；ALLOWED_ORIGINS 按需改
cd ..
```

### 2. 构建 executor 镜像（一次性）

```bash
docker build -f docker/executor.Dockerfile -t handleexcel-executor:latest .
```

这个镜像只装 pandas/numpy/openpyxl，不含网络工具，供每次 `/execute` 按需起一次性容器。

### 3. 开发模式（边改边生效）

```bash
docker compose up
```

- 浏览器打开 http://localhost:3001
- 后端源码改动自动 reload，前端 Turbopack 热更新
- 数据持久化到 `backend/data/`（`uploads/`、`outputs/`、`db.sqlite3`）

### 4. 生产模式（上线）

浏览器访问的地址如果不是 `localhost`，需要在启动前设置前端里的 API 基址：

```bash
export NEXT_PUBLIC_API_BASE=http://<你的服务器IP或域名>:8002
# 同时把这个地址加到 backend/.env 的 ALLOWED_ORIGINS
```

然后构建并启动：

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

- 前端走 `next build` + standalone server，镜像小、首屏快
- 后端无 reload、多 worker
- 停服务：`docker compose -f docker-compose.yml -f docker-compose.prod.yml down`
- 升级：`git pull && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`

### 5. 备份 / 恢复

所有数据都在 `backend/data/` 下：

```bash
# 备份
tar -czf backup-$(date +%F).tar.gz backend/data/

# 恢复
tar -xzf backup-YYYY-MM-DD.tar.gz
```

## 流程

1. 上传 Excel/CSV + 输入自然语言需求
2. 后端读表头+前 5 行样本（可脱敏）发给百炼生成 Python 代码
3. 前端展示代码，支持「确认执行」「让 AI 修改」「取消」
4. 确认后在一次性 Docker 容器里执行，结果 Excel 可预览 + 下载

## 安全机制

三层纵深防御：

| 层 | 做法 |
|---|---|
| AST 静态检查 | 只允许 pandas/numpy/openpyxl/datetime 等白名单库；禁止 `os`/`subprocess`/`eval`/`exec`/`open` |
| 容器隔离 | `--network none`、`--read-only`、`--memory 1g`、`--cpus 1`、`--pids-limit 128`、`--cap-drop ALL`、`nobody` 用户 |
| 文件系统隔离 | 每次执行单独 bind mount，容器只能访问本 job 的输入和输出，看不到其他 job / 宿主文件系统 |

超时默认 60 秒，可通过 `EXECUTOR_TIMEOUT` 调整。

## 目录结构

```
backend/
  Dockerfile                # multi-stage：dev + prod
  app/
    main.py                 # FastAPI 入口
    llm.py                  # 百炼调用
    excel_utils.py          # 读表头/样本
    executor.py             # Docker 兄弟容器执行 + AST 检查
    config.py               # 数据路径配置（从 env 读）
    db.py                   # SQLite 初始化
    storage/                # jobs / prompts CRUD
    routers/                # FastAPI 路由
  migrate_paths.py          # 一次性数据迁移脚本
  data/                     # 持久化数据（宿主挂载）
    uploads/
    outputs/
    db.sqlite3
  .env / .env.example

frontend/
  Dockerfile                # multi-stage：deps / dev / builder / prod
  next.config.ts            # output: 'standalone'
  src/
    app/page.tsx            # 单页应用
    components/             # UI 组件
    api/                    # 前端 API 客户端

docker/
  executor.Dockerfile       # 执行器镜像：仅 pandas/numpy/openpyxl

docker-compose.yml          # dev（默认）
docker-compose.prod.yml     # prod override
```

## 历史迁移

如果升级前本地已有老版本的 `backend/uploads/`、`backend/outputs/`、`backend/db.sqlite3`，升级后需要：

1. 把三者移到 `backend/data/` 下（`uploads/`、`outputs/`、`db.sqlite3`）
2. 运行迁移脚本重写 DB 里的绝对路径：

```bash
python3 backend/migrate_paths.py
```

脚本幂等，已经是新形态的记录会被跳过。
