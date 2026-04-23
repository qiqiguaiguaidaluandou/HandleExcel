# HandleExcel Docker 化 + 执行器隔离 — 最终方案

> 日期：2026-04-23
> 状态：已对齐，待实施

---

## 1. 核心决策（已对齐）

| 项 | 决定 |
|---|---|
| 部署形态 | Docker Compose |
| 环境 | dev + prod 两套 compose，共用 Dockerfile（multi-stage）|
| 反向代理 | **不做** |
| 鉴权 | **不做** |
| 执行器 | **T2**：后端挂 `docker.sock`，`docker run --rm` 起一次性 executor 容器 |
| 沙箱强度 | `--network none` + `--read-only` + rlimit（memory/cpu/pids）+ 非 root + cap-drop ALL |
| 数据持久化 | 统一到 `backend/data/{uploads,outputs,db.sqlite3}`，宿主挂载 |
| AST 检查 | 保留作为辅助（廉价的快速失败），不再是唯一防线 |

---

## 2. 架构

```
浏览器 (内网/可信用户)
  │
  ├─→ :3001  frontend (next start)          常驻
  │
  └─→ :8002  backend  (FastAPI)             常驻
               │ /api/execute
               ▼
           executor 一次性容器              按需启停，~1s 冷启动
           --rm --network none --read-only
           --memory 1g --cpus 1 --pids-limit 128
           --cap-drop ALL --security-opt no-new-privileges
           --user 65534:65534 (nobody)
           -v uploads/<job>:/in:ro
           -v outputs/<job>:/out:rw
           -v <tmp-script>.py:/app/run.py:ro
           timeout 60s
```

后端容器挂 `/var/run/docker.sock` 起兄弟容器。

---

## 3. 文件清单

### 新增

```
backend/Dockerfile                # multi-stage: base → dev → prod
frontend/Dockerfile               # multi-stage: deps → dev / build → prod-runtime
docker/executor.Dockerfile        # 只装 pandas/numpy/openpyxl，无网络工具
docker-compose.yml                # dev：源码 bind mount，uvicorn --reload，next dev
docker-compose.prod.yml           # prod override：用构建产物，next start，无 reload
.dockerignore                     # 排除 node_modules、.venv、.next、data/、__pycache__
backend/migrate_paths.py          # 一次性数据路径迁移脚本
```

### 修改

```
backend/app/config.py             # 路径全部从 env 读：DATA_DIR / UPLOAD_DIR / OUTPUT_DIR / DB_PATH
backend/app/executor.py           # 核心改造：subprocess → docker run，路径从绝对路径改为容器内 /in, /out
backend/app/main.py               # CORS 的 allow_origins 从 env 读，支持多个线上地址
backend/.env.example              # 新增：DATA_DIR, EXECUTOR_IMAGE, ALLOWED_ORIGINS, EXECUTOR_MEMORY, EXECUTOR_CPUS, EXECUTOR_TIMEOUT
frontend/next.config.ts           # 加 output: 'standalone'，让 prod 镜像变小
frontend/src/api/client.ts        # 确认 NEXT_PUBLIC_API_BASE 从 env 读（已经是这样）
README.md                         # 替换启动章节为 Docker 启动说明
```

### 不动

- 数据库 schema（`db.py`、`storage/jobs.py`、`storage/prompts.py`）
- LLM 模块（`llm.py`、`anonymize.py`）
- 所有前端组件（`components/*`）
- 路由层除 CORS 外（`routers/*`）

---

## 4. 执行器（`executor.py`）改造细节

**保留**：

- AST 白名单检查（便宜的第一道 pre-flight，能在不起容器时就拒掉明显恶意的代码）
- `WRAPPER_TEMPLATE`（注入 `INPUT_FILES` 和 `OUTPUT_FILE`）

**改变**：

- `INPUT_FILES` 的值从宿主绝对路径 → 容器内 `/in/xxx.xlsx`
- `OUTPUT_FILE` 的值从宿主绝对路径 → 容器内 `/out/result.xlsx`
- 每次执行时，backend 先把 job 的输入文件**软链**（Linux `symlink`）或**拷贝**到 `data/uploads/<job_id>/` 下，`data/outputs/<job_id>/` 作为结果目录。这样每个容器的挂载点只包含本 job 自己的文件，读不到其他 job。
- 用 `docker run --rm` 起 executor 镜像，子进程等它退出，收 stdout/stderr。
- 超时从 120s → 60s（容器隔离够硬，不需要为 subprocess 漏网留宽限）。超时后外层 `timeout=` 触发，再 `docker kill` 保底。

**安全模型变化**：

| 洞 | 之前 | 之后 |
|---|---|---|
| `pd.read_csv(URL)` 出网 | 能出 | `--network none` 堵死 |
| `pd.read_csv("/etc/passwd")` | 能读 | `--read-only` 根文件系统 + bind mount 只挂 `/in`，读不到 |
| 内存爆炸 | 无限制 | `--memory 1g` 触发 OOM 仅杀子容器 |
| CPU 占满 | 无限制 | `--cpus 1` |
| fork 炸弹 | 无限制 | `--pids-limit 128` |
| 提权 | 宿主用户权限 | `nobody` + `--cap-drop ALL` + `no-new-privileges` |

AST 检查还在，多一层不花钱的防御。

---

## 5. 数据迁移

一次性动作：

```
backend/
  uploads/          →  backend/data/uploads/        mv
  outputs/          →  backend/data/outputs/        mv
  db.sqlite3        →  backend/data/db.sqlite3      mv
```

db.sqlite3 里存的是**绝对路径**（`input_files` 字段），迁移脚本需要把老路径里的前缀替换（`/dataspace/kqspace/HandleExcel/backend/uploads/` → `/data/uploads/`）。提供一次性迁移 Python 脚本 `backend/migrate_paths.py`。

老数据**保留**（按默认保守方向处理）。

---

## 6. `.env.example` 最终形态

```bash
# --- LLM ---
DASHSCOPE_API_KEY=your_key_here
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_MODEL=qwen-plus

# --- 数据目录（容器内路径）---
DATA_DIR=/data
UPLOAD_DIR=/data/uploads
OUTPUT_DIR=/data/outputs
DB_PATH=/data/db.sqlite3

# --- CORS：多个用逗号分隔 ---
ALLOWED_ORIGINS=http://localhost:3001,http://<你的服务器IP>:3001

# --- 执行器 ---
EXECUTOR_IMAGE=handleexcel-executor:latest
EXECUTOR_MEMORY=1g
EXECUTOR_CPUS=1
EXECUTOR_TIMEOUT=60
EXECUTOR_PIDS_LIMIT=128

# --- 其他 ---
ANONYMIZE_SAMPLES=true
EXEC_AUTO_RETRY=2
```

前端有独立的 `.env.local`：

```bash
NEXT_PUBLIC_API_BASE=http://<你的服务器IP>:8002
```

---

## 7. 启动流程

### 一次性准备

```bash
# 1. 装 Docker（宿主机，略）

# 2. 构建 executor 镜像
docker build -f docker/executor.Dockerfile -t handleexcel-executor:latest .

# 3. 配置环境
cd backend && cp .env.example .env
# 编辑 .env 填 DASHSCOPE_API_KEY、ALLOWED_ORIGINS

cd ../frontend && cp .env.local.example .env.local
# 编辑 NEXT_PUBLIC_API_BASE

# 4. 迁移老数据（如有）
python backend/migrate_paths.py
```

### 开发（边改边生效）

```bash
docker compose up
# → http://localhost:3001
```

backend/frontend 源码 bind mount，保存即热更新。

### 上线（生产）

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
# → http://<服务器IP>:3001
```

前端走构建产物 + `next start`，后端无 reload、多 worker。

### 升级 / 重新部署

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### 备份

```bash
tar -czf backup-$(date +%F).tar.gz backend/data/
```

---

## 8. 风险与边界（明确接受）

| 风险 | 说明 | 接受理由 |
|---|---|---|
| **无鉴权** | 任意能访问到端口的人都能用 | 部署在内网/VPN/可信网段，由网络层访问控制保证 |
| **无限流** | 一个用户狂刷能打爆 DashScope 配额 | 同上，靠可信网段，或 DashScope 后台配 key 限额 |
| **SQLite 单文件** | 并发写会排队 | 用户量小够用，后续量上来再换 Postgres |
| **无任务队列** | `/api/execute` 同步阻塞一个 uvicorn worker | prod 配多 worker 缓解；量上来再加队列 |
| **executor 启动 1s 冷启动** | 每次执行多 1 秒延迟 | 可接受；真要追速可换 warm pool，现阶段不做 |
| **后端挂 docker.sock** | 后端被 RCE 等于宿主 root | 后端攻击面小，可接受；若未来改主意，拆 worker 即可 |

---

## 9. 不在本次改动范围内（明确不做）

- 反向代理 / HTTPS
- 鉴权 / 多租户 / 用户隔离
- 任务队列 / WebSocket 推送
- SQLite → Postgres
- 自动清理旧 job
- executor warm pool
- k8s / swarm

这些项都是后续独立迭代，当前版本不引入。

---

## 10. 默认参数

- 部署位置：**内网/VPN/可信网段**
- 老数据：**保留**（跑迁移脚本）
- executor 资源：**1g 内存 / 1 核 / 60s 超时**
- 后端 prod worker 数：**2**（CPU 数少就降为 1）

---

## 11. 实施步骤（执行顺序）

1. 创建 `backend/data/` 目录并迁移现有 `uploads/outputs/db.sqlite3`
2. 写迁移脚本 `backend/migrate_paths.py`，更新 SQLite 中绝对路径
3. 改 `backend/app/config.py`，路径从 env 读
4. 写 `docker/executor.Dockerfile`
5. 改 `backend/app/executor.py`：subprocess → docker run，加 per-job 挂载目录管理
6. 改 `backend/app/main.py`：CORS 从 env 读
7. 改 `backend/.env.example`
8. 写 `backend/Dockerfile`（multi-stage）
9. 写 `frontend/Dockerfile`（multi-stage）
10. 改 `frontend/next.config.ts`：加 standalone 输出
11. 写 `docker-compose.yml`（dev）
12. 写 `docker-compose.prod.yml`（prod override）
13. 写 `.dockerignore`
14. 改 `README.md`：新启动说明
15. 本地验证：构建 executor 镜像 + `docker compose up` + 跑一个完整流程
