import ast
import os
import subprocess
import sys
import tempfile
from pathlib import Path

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
    """静态检查 AI 生成的代码，拦截危险 import / 内置调用 / 覆盖保护变量。"""
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


def execute(code: str, input_files: list[str], output_file: str) -> dict:
    """在子进程中执行 AI 生成的代码。

    返回 {success, stdout, stderr, output_exists}。
    """
    check_code_safety(code)

    abs_inputs = [str(Path(p).resolve()) for p in input_files]
    abs_output = str(Path(output_file).resolve())

    wrapped = WRAPPER_TEMPLATE.format(
        input_files=abs_inputs,
        output_file=abs_output,
        user_code=code,
    )

    timeout = int(os.getenv("EXEC_TIMEOUT_SECONDS", "300"))

    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False, encoding="utf-8") as f:
        f.write(wrapped)
        script_path = f.name

    try:
        proc = subprocess.run(
            [sys.executable, script_path],
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(Path(abs_output).parent),
        )
        return {
            "success": proc.returncode == 0 and Path(abs_output).exists(),
            "returncode": proc.returncode,
            "stdout": proc.stdout[-4000:],
            "stderr": proc.stderr[-4000:],
            "output_exists": Path(abs_output).exists(),
        }
    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "returncode": -1,
            "stdout": "",
            "stderr": f"执行超时（{timeout} 秒）",
            "output_exists": False,
        }
    finally:
        Path(script_path).unlink(missing_ok=True)
