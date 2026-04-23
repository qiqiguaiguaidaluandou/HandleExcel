# HandleExcel

用 AI 处理 Excel 报表：上传文件 → 描述需求 → AI 生成 pandas 代码 → 审阅后执行 → 下载结果。

## 架构

- 后端：FastAPI（端口 8002），调用百炼 qwen-plus 生成代码，子进程 + AST 白名单执行
- 前端：Next.js 16 + Tailwind（端口 3001）

## 启动

**1. 配置 API Key**

```bash
cd backend
cp .env.example .env
# 编辑 .env，填入你的 DASHSCOPE_API_KEY
```

**2. 启动后端**

```bash
cd backend
./run.sh
# 或: python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8002 --reload
```

**3. 启动前端**

```bash
cd frontend
npm run dev
```

打开 http://localhost:3001

## 流程

1. 上传 Excel/CSV + 输入自然语言需求
2. 后端读表头+前 5 行样本，发给百炼生成 Python 代码
3. 前端展示代码，支持「确认执行」「让 AI 修改」「取消」
4. 确认后子进程执行代码，生成结果 Excel 供下载

## 安全机制

- AST 静态检查：只允许 pandas/numpy/openpyxl/datetime 等白名单库
- 禁止 `os`、`subprocess`、`eval`、`exec`、`open`
- 子进程隔离 + 30 秒超时

## 目录结构

```
backend/
  app/
    main.py          # FastAPI 入口
    llm.py           # 百炼调用
    excel_utils.py   # 读表头/样本
    executor.py      # 子进程执行 + 安全检查
    jobs.py          # 内存任务状态
  uploads/  outputs/
frontend/
  src/app/page.tsx   # 单页面应用
```
