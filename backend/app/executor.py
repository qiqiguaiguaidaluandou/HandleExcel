"""隔离执行器：把 LLM 产出的代码跑在一次性 Docker 容器里。

核心改动（相比早期 subprocess 版本）：
- 不再用 `subprocess.run(sys.executable, ...)` 跑本机解释器
- 改成 `docker run --rm ...` 起兄弟容器，用 EXECUTOR_IMAGE 这个预装 pandas 的镜像
- 加 --network none / --read-only / --memory / --cpus / --pids-limit / cap-drop ALL / nobody 用户
- 每次执行构建一个 per-job 的临时工作目录（TMP_DIR/<exec_id>/），把 run.py 和 out/ 挂进容器，
  每个输入文件单独按 /in/<idx>.<ext> 文件级 bind 挂载，容器内看不到任何其他输入或宿主目录
- AST 白名单检查保留，作为廉价的 pre-flight；真正的安全边界由容器隔离提供

host 路径换算：
- 后端容器里 DATA_DIR 默认 /data（docker-compose 把宿主 backend/data/ 挂在此）
- 但 `docker run -v` 的路径由宿主 docker daemon 解析，必须是宿主绝对路径
- 通过环境变量 HOST_DATA_DIR 告诉我们宿主路径，自动把 /data/... 换算成 /abs/host/backend/data/...
- HOST_DATA_DIR 未设置时（本机裸跑 / 单机测试）不换算，直接传原路径
"""
from __future__ import annotations

import ast
import os
import shutil
import subprocess
import uuid
from pathlib import Path

from .config import DATA_DIR, TMP_DIR

ALLOWED_IMPORTS = {
    "pandas", "numpy", "openpyxl", "datetime", "math",
    "re", "collections", "json", "decimal", "itertools", "functools",
}

FORBIDDEN_NAMES = {"__import__", "eval", "exec", "compile", "open"}

PROTECTED_NAMES = {"INPUT_FILES", "OUTPUT_FILE"}


class CodeSafetyError(Exception):
    pass


def _assigned_names(target: ast.AST) -> list[str]:
    """递归收集赋值目标上出现的所有 Name，用于拦截 `INPUT_FILES = ...`、
    `a, INPUT_FILES = ...`、`[INPUT_FILES, b] = ...` 等写法。"""
    names: list[str] = []
    if isinstance(target, ast.Name):
        names.append(target.id)
    elif isinstance(target, (ast.Tuple, ast.List)):
        for elt in target.elts:
            names.extend(_assigned_names(elt))
    elif isinstance(target, ast.Starred):
        names.extend(_assigned_names(target.value))
    return names


def check_code_safety(code: str) -> None:
    """静态检查 AI 生成的代码，拦截危险 import / 内置调用 / 覆盖保护变量。

    这是容器隔离之外的一层辅助防御：便宜、失败快、能在启动容器前就拒掉明显恶意的代码。
    真正的硬隔离由 `docker run` 的 --network none / --read-only / --cap-drop 等参数提供。
    """
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        raise CodeSafetyError(f"语法错误: {e}") from e

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                top = alias.name.split(".")[0]
                if top not in ALLOWED_IMPORTS:
                    raise CodeSafetyError(f"不允许导入模块: {alias.name}")
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                top = node.module.split(".")[0]
                if top not in ALLOWED_IMPORTS:
                    raise CodeSafetyError(f"不允许从模块导入: {node.module}")
        elif isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Name) and func.id in FORBIDDEN_NAMES:
                raise CodeSafetyError(f"不允许调用: {func.id}")
        elif isinstance(node, ast.Assign):
            for tgt in node.targets:
                for name in _assigned_names(tgt):
                    if name in PROTECTED_NAMES:
                        raise CodeSafetyError(
                            f"不允许重新赋值保护变量 {name}（它已由运行时注入）"
                        )
        elif isinstance(node, (ast.AugAssign, ast.AnnAssign)):
            for name in _assigned_names(node.target):
                if name in PROTECTED_NAMES:
                    raise CodeSafetyError(
                        f"不允许重新赋值保护变量 {name}（它已由运行时注入）"
                    )


WRAPPER_TEMPLATE = """
import sys
import re
import math
import json
import datetime
import collections
import itertools
import functools
from decimal import Decimal
import numpy as np
import pandas as pd

INPUT_FILES = {input_files!r}
OUTPUT_FILE = {output_file!r}

# ---- USER CODE START ----
{user_code}
# ---- USER CODE END ----
"""


def _host_path(container_path: str | Path) -> str:
    """把后端容器视角的路径换算成宿主 docker daemon 视角的路径。

    未设置 HOST_DATA_DIR 时（本机开发 / 非容器化部署）直接返回原路径。
    """
    host_base = os.getenv("HOST_DATA_DIR", "").strip()
    if not host_base:
        return str(container_path)
    try:
        p = Path(container_path).resolve()
        rel = p.relative_to(DATA_DIR.resolve())
    except (ValueError, OSError):
        return str(container_path)
    return str(Path(host_base) / rel)


def _make_exec_id(output_file: str) -> str:
    """从 output_file 路径里推 exec_id（与 job_id 一致，便于排查），失败则随机。"""
    stem = Path(output_file).stem
    if stem.endswith("_result"):
        return stem[: -len("_result")]
    return uuid.uuid4().hex[:12]


def execute(code: str, input_files: list[str], output_file: str) -> dict:
    """在一次性 Docker 容器里执行用户代码。

    返回 {success, returncode, stdout, stderr, output_exists}。
    """
    check_code_safety(code)

    exec_id = _make_exec_id(output_file)
    workdir = TMP_DIR / exec_id
    if workdir.exists():
        shutil.rmtree(workdir, ignore_errors=True)
    workdir.mkdir(parents=True, exist_ok=True)

    out_dir = workdir / "out"
    out_dir.mkdir()
    # 容器以 nobody(65534) 身份写 /out，宿主目录必须允许 nobody 写入
    os.chmod(out_dir, 0o777)

    # 每个输入文件按顺序绑定到 /in/<idx>.<ext>（只读单文件 mount）
    container_inputs: list[str] = []
    input_mounts: list[tuple[str, str]] = []  # (host_abs, container_path)
    for i, inp in enumerate(input_files):
        ext = Path(inp).suffix
        container_path = f"/in/{i}{ext}"
        container_inputs.append(container_path)
        input_mounts.append((_host_path(inp), container_path))

    container_output = "/out/result.xlsx"

    wrapped = WRAPPER_TEMPLATE.format(
        input_files=container_inputs,
        output_file=container_output,
        user_code=code,
    )
    script_path = workdir / "run.py"
    script_path.write_text(wrapped, encoding="utf-8")
    os.chmod(script_path, 0o644)

    image = os.getenv("EXECUTOR_IMAGE", "handleexcel-executor:latest")
    memory = os.getenv("EXECUTOR_MEMORY", "1g")
    cpus = os.getenv("EXECUTOR_CPUS", "1")
    pids_limit = os.getenv("EXECUTOR_PIDS_LIMIT", "128")
    timeout = int(os.getenv("EXECUTOR_TIMEOUT", "60"))

    container_name = f"hx-exec-{exec_id}-{uuid.uuid4().hex[:6]}"

    docker_cmd: list[str] = [
        "docker", "run", "--rm",
        "--name", container_name,
        "--network", "none",
        "--read-only",
        "--tmpfs", "/tmp:size=256m",
        "--memory", memory,
        "--memory-swap", memory,  # 禁止 swap 扩展
        "--cpus", str(cpus),
        "--pids-limit", str(pids_limit),
        "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges",
        "--user", "65534:65534",
        "-v", f"{_host_path(script_path)}:/app/run.py:ro",
        "-v", f"{_host_path(out_dir)}:/out:rw",
    ]
    for host_p, container_p in input_mounts:
        docker_cmd += ["-v", f"{host_p}:{container_p}:ro"]
    docker_cmd += [image, "python", "/app/run.py"]

    stdout = ""
    stderr = ""
    returncode = -1
    timed_out = False

    try:
        proc = subprocess.run(
            docker_cmd,
            capture_output=True,
            text=True,
            timeout=timeout + 5,  # 多给 5 秒让 docker 自己退出，之外我们手动 kill
        )
        stdout = proc.stdout[-4000:]
        stderr = proc.stderr[-4000:]
        returncode = proc.returncode
    except subprocess.TimeoutExpired:
        timed_out = True
        subprocess.run(
            ["docker", "kill", container_name],
            capture_output=True,
            text=True,
            timeout=10,
        )
        stderr = f"执行超时（{timeout} 秒）"

    produced = out_dir / "result.xlsx"
    output_exists = False
    if not timed_out and returncode == 0 and produced.exists():
        # 结果搬到 OUTPUT_DIR（持久路径）
        Path(output_file).parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(produced), output_file)
        output_exists = True

    # 清理工作目录（含 run.py、out/ 剩余）
    shutil.rmtree(workdir, ignore_errors=True)

    return {
        "success": (not timed_out) and returncode == 0 and output_exists,
        "returncode": returncode,
        "stdout": stdout,
        "stderr": stderr,
        "output_exists": output_exists,
    }
