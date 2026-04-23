# HandleExcel 架构文档

## 1. 系统概览

HandleExcel 是一个「自然语言驱动的 Excel 报表处理器」。用户上传表格 + 描述需求 → LLM 生成 pandas 代码 → 用户审阅后隔离执行 → 下载结果。

核心设计思路：**表数据不上云**。只把表头和前 5 行样本发给模型，完整数据始终在服务端本地处理。

---

## 2. 技术栈

| 层 | 技术 | 版本 |
|---|---|---|
| 前端框架 | Next.js + React | 16.2.4 / 19.2.4 |
| 前端样式 | Tailwind CSS | v4 |
| 前端 UI | lucide-react + react-syntax-highlighter | - |
| 后端框架 | FastAPI + uvicorn | 0.115 / 0.32 |
| 后端数据处理 | pandas + openpyxl | 2.2.3 / 3.1.5 |
| LLM | 通义千问 qwen-plus（走 OpenAI 兼容层） | - |
| 持久化 | SQLite（标准库 `sqlite3`） | - |
| 进程隔离 | subprocess + AST 白名单 | - |

---

## 3. 目录结构

```
HandleExcel/
├── README.md
├── docs/
│   └── ARCHITECTURE.md       # 本文档
├── backend/
│   ├── .env(.example)        # DASHSCOPE_API_KEY / EXEC_TIMEOUT_SECONDS 等
│   ├── requirements.txt
│   ├── run.sh                # 启动脚本: uvicorn --reload --port 8002
│   ├── db.sqlite3            # 运行时生成，存会话和消息
│   ├── uploads/              # 用户上传文件，UUID 命名
│   ├── outputs/              # AI 执行结果，{job_id}_result.xlsx
│   └── app/
│       ├── main.py           # FastAPI 路由层
│       ├── llm.py            # LLM 调用 + prompt 构造
│       ├── executor.py       # AST 检查 + 子进程执行
│       ├── excel_utils.py    # 读取表头/样本
│       ├── jobs.py           # 会话 + 消息 CRUD（SQLite）
│       └── db.py             # SQLite 连接管理 + schema 初始化
└── frontend/
    ├── package.json          # Next.js 16 + React 19
    ├── src/app/
    │   ├── layout.tsx        # 根布局（元信息、字体、html lang=zh-CN）
    │   ├── globals.css       # Tailwind 入口
    │   └── page.tsx          # 单页应用（约 800 行，含 Sidebar/MessageBubble 等子组件）
    └── AGENTS.md             # 约定：Next 16 有破坏性变更，改代码前查 node_modules/next/dist/docs
```

---

## 4. 运行时架构

```
┌────────────────────┐          HTTP/JSON + FormData           ┌─────────────────────────┐
│ Browser            │ ←───────────────────────────────────────→│ FastAPI (port 8002)     │
│ Next.js (3001)     │                                          │  app/main.py            │
│  - page.tsx        │                                          │                         │
│  - Sidebar         │                                          │ ┌─────────────────────┐ │
│  - MessageBubble   │                                          │ │ excel_utils         │ │
│  - CodeCard        │                                          │ │   读表头+样本        │ │
│  - ResultCard      │                                          │ └─────────────────────┘ │
└────────────────────┘                                          │ ┌─────────────────────┐ │
                                                                │ │ llm                 │ │
                                                                │ │   构造 prompt       │ │
                                                                │ │   调 qwen-plus      │ │─────→ DashScope
                                                                │ └─────────────────────┘ │   OpenAI-compatible
                                                                │ ┌─────────────────────┐ │
                                                                │ │ executor            │ │
                                                                │ │   AST check         │ │
                                                                │ │   subprocess(py)    │ │──┐
                                                                │ └─────────────────────┘ │  │
                                                                │ ┌─────────────────────┐ │  │
                                                                │ │ jobs + db           │ │  │
                                                                │ │   SQLite CRUD       │ │  │
                                                                │ └─────────────────────┘ │  │
                                                                └──────┬──────────────────┘  │
                                                                       │                     │
                                                                 ┌─────▼─────┐        ┌──────▼────────┐
                                                                 │db.sqlite3 │        │ subprocess    │
                                                                 │jobs/msgs  │        │ /tmp/xxx.py   │
                                                                 └───────────┘        │  INPUT_FILES  │
                                                                                      │  OUTPUT_FILE  │
                                                                                      │  (30~120s 超时)│
                                                                                      └────┬──────────┘
                                                                                           │
                                                                                   uploads/, outputs/
```

---

## 5. 三条主数据流

### 5.1 初次分析（`POST /api/analyze`）

```
用户上传文件 + 需求
  │
  ├─► main.py: 校验后缀白名单（xlsx/xls/xlsm/csv）
  │   保存到 uploads/{uuid}.xlsx
  │
  ├─► excel_utils.inspect_file(path)
  │   打开每个 sheet，提取 columns / row_count / head(5)
  │
  ├─► llm.generate_code(files_info, requirement)
  │   拼 system_prompt（白名单库、禁用 open/os/subprocess、不能重赋 INPUT_FILES...）
  │   + user_prompt（文件名、列名、前 5 行 JSON、用户需求）
  │   调 qwen-plus（temperature=0.2, response_format=json_object）
  │   返回 { code, explanation, _history: [messages...] }
  │
  ├─► jobs.create() 写入 jobs 表
  │   jobs.update() 存 code / explanation / history
  │   jobs.add_message() 追加 2 条消息：user + assistant(code)
  │
  └─► 返回 { job_id, code, explanation, files_info }

前端：显示 CodeCard，按钮「确认执行 / 查看代码」
```

### 5.2 迭代修订（`POST /api/revise`）

```
用户在侧边栏已有会话里输入修改指令
  │
  ├─► jobs.get(job_id) → 拿到完整 history
  │
  ├─► llm.generate_code([], instruction, history=job.history)
  │   使用上一轮对话 history，不再重新发表格样本
  │   append "请按以下要求修改上一版代码：{instruction}"
  │
  ├─► jobs.update() 覆盖 code + 新 history
  │   jobs.add_message() user(修订指令) + assistant(新 code)
  │
  └─► 返回 { job_id, code, explanation }
```

### 5.3 执行（`POST /api/execute`）

```
用户点「确认执行」
  │
  ├─► jobs.update(status="executing", output_file=".../{job_id}_result.xlsx")
  │
  ├─► executor.execute(code, input_files, output_file)
  │   │
  │   ├─► check_code_safety(code)  [AST 静态检查]
  │   │     - import 白名单: pandas/numpy/openpyxl/datetime/math/re/collections/...
  │   │     - 禁用 Name 调用: __import__/eval/exec/compile/open
  │   │     - 禁用赋值保护变量: INPUT_FILES / OUTPUT_FILE（含元组/增广/注解赋值）
  │   │
  │   ├─► 把用户代码套进 WRAPPER_TEMPLATE：
  │   │     预导入 re/math/json/datetime/numpy/pandas...
  │   │     INPUT_FILES = [...]    # repr 注入绝对路径
  │   │     OUTPUT_FILE = "..."
  │   │     # ---- USER CODE START/END ----
  │   │
  │   ├─► 写临时文件 tempfile → subprocess.run(python, timeout=30~120s, cwd=outputs/)
  │   │     capture_output + text 模式
  │   │     截断 stdout/stderr 到 4000 字符
  │   │
  │   └─► 返回 { success, stdout, stderr, output_exists }
  │
  ├─► 成功 → jobs.update(status="done")
  │         jobs.update_last_message_of_kind("code", {status:"done"})
  │         jobs.add_message(result, {stdout})
  │
  ├─► 失败（CodeSafetyError）→ 返回 400，同时消息打 failed
  ├─► 失败（子进程错误）→ 返回 200 + status=failed，前端展示 stderr 并提供重试
  │
  └─► 前端调 /api/preview/{job_id} 拉前 20 行展示
```

---

## 6. 数据模型

### 6.1 数据库（SQLite，`backend/db.sqlite3`）

```sql
CREATE TABLE jobs (
  job_id         TEXT PRIMARY KEY,       -- uuid.hex[:12]
  title          TEXT NOT NULL,          -- 首条需求截断前 30 字
  requirement    TEXT NOT NULL,          -- 原始需求
  input_files    TEXT NOT NULL,          -- JSON: 上传文件绝对路径数组
  filenames      TEXT NOT NULL,          -- JSON: 原始文件名数组
  code           TEXT DEFAULT '',        -- 当前最新代码
  explanation    TEXT DEFAULT '',        -- 当前最新说明
  history        TEXT DEFAULT '[]',      -- JSON: 给 LLM 的消息历史（不含 system）
  output_file    TEXT,                   -- 结果文件绝对路径
  status         TEXT DEFAULT 'pending_confirm',
                                         --  pending_confirm | executing | done | failed
  error          TEXT,                   -- 最近一次错误
  stdout         TEXT,                   -- 最近一次 stdout
  created_at     TEXT NOT NULL,          -- ISO 8601 UTC
  updated_at     TEXT NOT NULL
);

CREATE TABLE messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id     TEXT NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  seq        INTEGER NOT NULL,           -- 会话内单调递增
  role       TEXT NOT NULL,              -- user | assistant
  kind       TEXT NOT NULL,              -- user | code | result
  payload    TEXT NOT NULL,              -- JSON，按 kind 不同结构不同（见下）
  created_at TEXT NOT NULL
);
CREATE INDEX idx_messages_job ON messages(job_id, seq);
```

**messages.payload 按 kind 的结构：**

| kind | payload |
|---|---|
| `user` | `{ text: string, files: [{name, size}] }` |
| `code` | `{ code, explanation, status: "pending"\|"done"\|"failed", runError? }` |
| `result` | `{ stdout }`（表格数据不入库，preview 时实时读 Excel） |

### 6.2 前端 Message 类型（`page.tsx`）

```typescript
type Message =
  | { kind: "text"; role: "assistant"; text }                    // 欢迎语（不持久化）
  | { role: "user"; text; files?: [{name, size}] }
  | { kind: "code"; role: "assistant"; jobId; code; explanation;
      status: "pending" | "running" | "done" | "failed"; runError? }
  | { kind: "result"; role: "assistant"; jobId; sheets; stdout? }
  | { kind: "error"; role: "assistant"; text }                   // 纯前端错误（不持久化）
```

从后端加载时的映射：`user` / `code` / `result` 三种 kind 直接对应，`running` 状态仅存在前端（执行中短暂态），`text` 和 `error` 两种 kind 只存在前端。

---

## 7. API 契约

| 方法 | 路径 | 作用 | 关键入参 | 关键返回 |
|---|---|---|---|---|
| GET | `/api/health` | 健康检查 | - | `{status:"ok"}` |
| POST | `/api/analyze` | 上传文件+生成代码 | `requirement`, `files[]` (multipart) | `{job_id, code, explanation, files_info}` |
| POST | `/api/revise` | 基于已有会话修订代码 | `job_id`, `instruction` (form) | `{job_id, code, explanation}` |
| POST | `/api/execute` | 执行当前代码 | `job_id` (form) | `{status: "done"\|"failed", stdout, stderr?, download_url?}` |
| GET | `/api/preview/{job_id}` | 读结果前 20 行 | - | `{sheets: [{name, columns, row_count, rows}]}` |
| GET | `/api/download/{job_id}` | 下载结果 xlsx | - | FileResponse |
| GET | `/api/jobs` | 列出所有会话（按 updated_at 倒序） | - | `{jobs: [{job_id, title, status, filenames, created_at, updated_at}]}` |
| GET | `/api/job/{job_id}` | 会话详情 + 消息流 | - | `{job_id, title, status, messages, has_output, ...}` |
| DELETE | `/api/job/{job_id}` | 删会话并清理文件 | - | `{ok:true}` |

CORS：只允许 `http://localhost:3001` / `127.0.0.1:3001`。

---

## 8. 安全模型（纵深防御）

从外到内三层：

### 层 1: AST 静态检查（`executor.py:check_code_safety`）

- **import 白名单**：只允许 `pandas / numpy / openpyxl / datetime / math / re / collections / json / decimal / itertools / functools`
- **Name 调用黑名单**：`__import__` / `eval` / `exec` / `compile` / `open`
- **保护变量**：`INPUT_FILES` 和 `OUTPUT_FILE` 不允许被任何形式的赋值覆盖（含 `a, INPUT_FILES = ...`、`INPUT_FILES += ...`、`INPUT_FILES: list = ...`）

### 层 2: 子进程隔离

- 写 `tempfile.NamedTemporaryFile(.py)`，新起 python 进程
- `subprocess.run(capture_output=True, timeout=EXEC_TIMEOUT_SECONDS)`（默认 120s）
- CWD 限制到 `outputs/` 目录（非 uploads/，减少误读）
- stdout/stderr 截断到 4KB

### 层 3: 运行时注入

- `INPUT_FILES` 和 `OUTPUT_FILE` 由 wrapper 在用户代码之前 `repr` 注入绝对路径
- 用户代码不知道原始文件名对应的 UUID 文件名（除非通过 prompt）

**当前不足：**

- pandas `read_csv` / `read_excel` 接受 URL → **可能联网**
- 没有内存 / CPU rlimit → 大 `groupby` 可把机器吃光
- 子进程仍是宿主权限，可读任意宿主文件（AST 堵了 `open()`，但 `pd.read_*` 没堵路径）

（这三点是目前「半沙箱」的主要漏洞，要真开放外部需上 namespace / Docker / gVisor。）

---

## 9. 持久化与文件系统

```
backend/
├── db.sqlite3           # 会话元数据 + 消息流，.gitignore 忽略
├── uploads/
│   ├── .gitkeep
│   └── {uuid}.xlsx      # 保存用户上传，job 删除时一并清理
└── outputs/
    ├── .gitkeep
    └── {job_id}_result.xlsx  # 执行结果，每次 execute 覆盖同名
```

- **生命周期**：`DELETE /api/job/{id}` 会同步删除 input_files + output_file
- **无自动清理**：未被手动删除的 job 和其文件会长期堆积
- **并发**：SQLite 默认序列化写，单实例够用；每次操作新建连接（per-request），没有连接池

---

## 10. 前端状态管理

单文件 `page.tsx`，无外部状态管理库，全部用 `useState` + 回调：

| State | 作用 |
|---|---|
| `messages: Message[]` | 当前会话的消息流（UI 用） |
| `sessionJobId` | 当前激活的后端 job id；为 `null` 时代表「新对话」|
| `jobs: JobSummary[]` | 侧边栏列表，挂载时拉 `/api/jobs` |
| `pendingFiles / input` | 未发送的文件和输入文本 |
| `sending / loadingJob` | 进行中请求的锁 |
| `sidebarOpen` | 侧边栏展开/收起 |

**关键交互函数：**

- `send()` — 根据 `sessionJobId` 走 `/analyze`（首轮）或 `/revise`（续轮）
- `execute(msgId, jobId)` — 触发 `/execute`，完成后再拉 `/preview` 展示
- `loadSession(jobId)` — 拉 `/api/job/{id}` 的 messages，重建前端 Message[]；含 result 消息时还会同步拉 `/preview`
- `deleteSession(jobId)` — 带 confirm，删除后如是当前会话则回到 WELCOME
- `startNewChat()` — 清空 messages/input/files，焦点移到 textarea
- `isFreshChat`（derived） — 用于在已处于空状态时禁用侧边栏「新对话」按钮

**刷新 jobs 列表的触发点**：挂载、analyze 成功、revise 成功、execute 成功/失败、delete 后、handleJobLost 后。

---

## 11. 配置（`backend/.env`）

| 变量 | 默认 | 作用 |
|---|---|---|
| `DASHSCOPE_API_KEY` | 必填 | 百炼 API 密钥 |
| `DASHSCOPE_BASE_URL` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | OpenAI 兼容入口 |
| `LLM_MODEL` | `qwen-plus` | 模型名 |
| `EXEC_TIMEOUT_SECONDS` | `120`（.env）/ `30`（代码 fallback） | 子进程硬超时 |
| `NEXT_PUBLIC_API_BASE`（前端） | `http://localhost:8002` | 后端地址 |

---

## 12. 启动与部署

**开发：**
```bash
# Backend
cd backend && cp .env.example .env   # 填 DASHSCOPE_API_KEY
./run.sh                              # uvicorn --reload, port 8002

# Frontend
cd frontend && npm install && npm run dev   # next dev -p 3001
```

访问 `http://localhost:3001`。

**当前没有：**

- Dockerfile / docker-compose
- 生产 WSGI/ASGI 配置（uvicorn 还是 `--reload` 开发模式）
- 任务队列 / 异步执行（execute 是同步阻塞）
- 鉴权 / 多租户

---

## 13. 已知限制和设计边界

| 限制 | 影响 | 规避/缓解 |
|---|---|---|
| 给 LLM 的表信息仅 head(5) | 模型猜不到尾部脏数据 | 可扩 `_summarize` 加 dtype / null 率 / 随机样本 |
| 执行是同步的 | 大任务卡住一个 worker | 需要 BackgroundTasks + WebSocket 推送 |
| 失败无自愈 | 执行挂了要人手动改 prompt | 可接 traceback → LLM → 重新生成循环 |
| 结果文件覆盖 | 不能对比不同版本 | 改成 `{job_id}_v{n}.xlsx` |
| 子进程非沙箱 | pandas 可联网 / 读任意路径 / 无内存限 | 需 rlimit + 网络 namespace + chroot / Docker |
| 无鉴权 | 公网暴露即失守 | 加 API Key / OAuth |
| 无文件清理 | 磁盘无限增长 | 定期 cron 扫旧 job |
| SQLite 单文件 | 多进程部署有锁竞争 | 上 Postgres |
| LLM 调用无重试 | 限流抖动即 500 | tenacity 指数退避 |
