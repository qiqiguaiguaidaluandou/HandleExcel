import json
import os
import re
from typing import Optional

from openai import OpenAI

_client: Optional[OpenAI] = None


def get_client() -> OpenAI:
    global _client
    if _client is None:
        api_key = os.getenv("DASHSCOPE_API_KEY")
        if not api_key:
            raise RuntimeError("DASHSCOPE_API_KEY 未配置，请在 backend/.env 中设置")
        _client = OpenAI(
            api_key=api_key,
            base_url=os.getenv(
                "DASHSCOPE_BASE_URL",
                "https://dashscope.aliyuncs.com/compatible-mode/v1",
            ),
        )
    return _client


SYSTEM_PROMPT = """你是一个 Excel 数据处理专家。用户会提供：
1. 一张或多张 Excel 表的「表头」和「前若干行样本」
2. 一段自然语言的处理需求

你需要生成一段 Python 代码，使用 pandas 完成处理，并将结果写入 Excel 文件。

【严格要求】
- 只能使用以下库：pandas, numpy, openpyxl, datetime, math, re, collections
- **每个用到的模块必须在代码开头显式 import**（如用到正则必须写 `import re`，用 datetime 必须写 `import datetime`）
- 禁止使用 os, subprocess, sys, shutil, socket, requests, open() 读写任意路径的文件
- 输入文件路径通过变量 INPUT_FILES 提供（list[str]），按用户上传顺序对应
- 输出必须写到 OUTPUT_FILE 指定的路径（str），使用 .to_excel(OUTPUT_FILE, index=False)
- 如果有多张结果表，使用 pd.ExcelWriter(OUTPUT_FILE) 写多个 sheet
- 代码要健壮：处理缺失值、类型转换异常等

【变量约定 - 必须严格遵守】
- `INPUT_FILES` 和 `OUTPUT_FILE` 是运行时已注入的全局变量，**不要重新定义、赋值或覆盖它们**
- 绝对不要写 `INPUT_FILES = [...]` 或 `OUTPUT_FILE = "..."`；直接读取即可
- 上文提示中出现的文件名（如 `test_excel.xlsx`）只是给你看上下文用的，**不要把这些字符串当作文件路径使用**，真实路径只能通过 `INPUT_FILES[i]` 获得

【类型与空值处理】（numpy 2.x 严格 dtype 规则）
- `np.where(cond, a, b)` 和 `np.select([...], [...], default=...)` 的所有分支返回值**必须同类型**
- **禁止**在字符串分支里用 `np.nan` 作为 fallback（会触发 `DTypePromotionError`）
  - 错: `np.where(m, '达成', np.nan)`
  - 对: `np.where(m, '达成', '未达成')` 或 `np.where(m, '达成', '')` 或 `np.where(m, '达成', pd.NA)`
- 数值分支的空值用 `np.nan`；字符串分支的空值用 `''` 或 `pd.NA`
- 布尔比较前若有 NaN，先 `.fillna(...)` 或用 `pd.isna(...)` 显式判断，避免布尔运算出 NaN 传染
- 日期比较前确保两列都是 `pd.to_datetime(..., errors="coerce")` 转换后的 datetime 类型

【性能要求】（数据可能有几万到几十万行）
- 必须使用 pandas 向量化操作：groupby/agg、merge、boolean indexing、np.where、pd.cut
- 禁止使用 df.iterrows()、df.itertuples()、逐行 for 循环
- 避免在 apply 中做复杂逻辑；必须用 apply 时优先用 map / .str 矢量方法替代
- 写 Excel 时若行数 > 100000，优先用 engine="openpyxl" 的 write_only 模式或分 sheet 保存

【输出格式】
必须严格返回一个 JSON 对象，格式如下（不要包含 markdown 代码块标记）：
{
  "code": "import pandas as pd\\n...",
  "explanation": "简要说明这段代码做了什么（2-3 句中文）"
}
"""


def _build_user_prompt(files_info: list[dict], user_requirement: str) -> str:
    anonymized = any(info.get("anonymized") for info in files_info)
    parts = ["## 上传的表格信息\n"]

    parts.append("### 文件名 ↔ INPUT_FILES 索引映射表（必读）")
    parts.append("用户需求中如出现以下任一文件名，必须通过对应的 INPUT_FILES 索引读取：")
    for i, info in enumerate(files_info):
        parts.append(f"- `{info['filename']}` → `INPUT_FILES[{i}]`")
    parts.append(
        "正例：`pd.read_excel(INPUT_FILES[0])`\n"
        "反例：`pd.read_excel(\"订单表.xlsx\")`（严禁把文件名字符串当路径）\n"
    )

    if anonymized:
        parts.append(
            "> 注意：以下「样本」数据出于隐私考虑已被脱敏，仅保留列名、类型、"
            "字符长度和常见格式（如日期/手机号）。不要依赖具体取值，"
            "代码应基于列名和结构通用地处理。\n"
        )
    for i, info in enumerate(files_info):
        parts.append(f"### 文件 {i}: `{info['filename']}`")
        parts.append(f"INPUT_FILES[{i}] 对应此文件")
        for sheet_name, sheet in info["sheets"].items():
            parts.append(f"\n**Sheet: `{sheet_name}`**")
            parts.append(f"行数: {sheet['row_count']}, 列数: {len(sheet['columns'])}")
            parts.append(f"列名: {sheet['columns']}")
            sample_label = "样本（已脱敏，仅供结构参考）" if anonymized else "样本"
            parts.append(f"前 {len(sheet['sample'])} 行{sample_label}（JSON）:")
            parts.append("```json")
            parts.append(json.dumps(sheet["sample"], ensure_ascii=False, default=str))
            parts.append("```")
    parts.append("\n## 用户需求")
    parts.append(user_requirement)
    parts.append("\n请生成符合要求的 JSON。")
    return "\n".join(parts)


def _extract_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            return json.loads(match.group(0))
        raise


def generate_code(
    files_info: list[dict],
    user_requirement: str,
    history: Optional[list[dict]] = None,
) -> dict:
    """调用大模型生成 pandas 代码。

    history: 之前的对话消息列表，用于「让 AI 修改」流程。
    返回 {"code": str, "explanation": str}。
    """
    client = get_client()
    model = os.getenv("LLM_MODEL", "qwen-plus")

    messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]
    if history:
        messages.extend(history)
        messages.append({"role": "user", "content": f"请按以下要求修改上一版代码：\n{user_requirement}"})
    else:
        messages.append({"role": "user", "content": _build_user_prompt(files_info, user_requirement)})

    resp = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.2,
        response_format={"type": "json_object"},
    )
    content = resp.choices[0].message.content or ""
    result = _extract_json(content)

    new_history = messages[1:] + [{"role": "assistant", "content": content}]
    result["_history"] = new_history
    return result
