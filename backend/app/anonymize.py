"""样本脱敏：把 DataFrame 的真实数据替换为保留类型/格式的伪造数据。

目标：LLM 仍然能看懂「这列是什么结构」，但看不到任何真实取值。
非目标：统计上完全等价 / 保留唯一性 / 保留相关关系。
"""

import datetime
import random
import re
import string
from typing import Any

import numpy as np
import pandas as pd

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_CHINA_MOBILE_RE = re.compile(r"^1[3-9]\d{9}$")
_ID_CARD_RE = re.compile(r"^\d{17}[\dXx]$")
_PURE_DIGITS_RE = re.compile(r"^-?\d+$")
_PURE_DECIMAL_RE = re.compile(r"^-?\d+\.\d+$")
_DATE_STR_RE = re.compile(
    r"^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$"
)
_CJK_RE = re.compile(r"^[\u4e00-\u9fff·]+$")

_CJK_POOL = "示例样本测试数据占位随机字符伪造模拟仿真替代参考"
_MOBILE_PREFIXES = ("138", "139", "135", "136", "137", "188", "189", "158", "159", "180")


def _fake_string(value: str, rng: random.Random) -> str:
    v = value.strip()
    if not v:
        return value

    if _EMAIL_RE.match(v):
        user = "".join(rng.choices(string.ascii_lowercase, k=rng.randint(5, 10)))
        return f"{user}@example.com"

    if _CHINA_MOBILE_RE.match(v):
        return rng.choice(_MOBILE_PREFIXES) + "".join(rng.choices(string.digits, k=8))

    if _ID_CARD_RE.match(v):
        body = "".join(rng.choices(string.digits, k=17))
        tail = rng.choice(string.digits + "X")
        return body + tail

    if _DATE_STR_RE.match(v):
        sep = next((c for c in "-/." if c in v[:10]), "-")
        y = rng.randint(2020, 2026)
        m = rng.randint(1, 12)
        d = rng.randint(1, 28)
        head = f"{y:04d}{sep}{m:02d}{sep}{d:02d}"
        if len(v) > 10:
            return head + v[10:]
        return head

    if _PURE_DIGITS_RE.match(v):
        neg = v.startswith("-")
        body = v.lstrip("-")
        new = "".join(rng.choices(string.digits, k=len(body)))
        return ("-" if neg else "") + new

    if _PURE_DECIMAL_RE.match(v):
        int_part, dec_part = v.lstrip("-").split(".")
        new_int = "".join(rng.choices(string.digits, k=len(int_part)))
        new_dec = "".join(rng.choices(string.digits, k=len(dec_part)))
        return ("-" if v.startswith("-") else "") + new_int + "." + new_dec

    if _CJK_RE.match(v):
        return "".join(rng.choices(_CJK_POOL, k=len(v)))

    # 混合/英文：按字符类别替换，保留分隔符
    out_chars = []
    for c in v:
        if c.isdigit():
            out_chars.append(rng.choice(string.digits))
        elif c.isalpha() and c.isascii():
            out_chars.append(rng.choice(string.ascii_letters))
        elif "\u4e00" <= c <= "\u9fff":
            out_chars.append(rng.choice(_CJK_POOL))
        else:
            out_chars.append(c)
    return "".join(out_chars)


def _fake_int(value: int, rng: random.Random) -> int:
    v = int(value)
    if v == 0:
        return rng.randint(0, 9)
    mag = abs(v)
    low = max(1, mag // 2)
    high = max(low + 1, mag * 2)
    new = rng.randint(low, high)
    return -new if v < 0 else new


def _fake_float(value: float, rng: random.Random) -> float:
    v = float(value)
    if v == 0:
        return round(rng.uniform(0, 10), 2)
    mag = abs(v)
    new = rng.uniform(mag * 0.5, mag * 1.5)
    s = repr(v)
    decimals = len(s.split(".")[1]) if "." in s and "e" not in s else 2
    decimals = min(decimals, 6)
    new = round(new, decimals)
    return -new if v < 0 else new


def _fake_value(value: Any, rng: random.Random) -> Any:
    # 缺失值原样返回（LLM 需要知道有 NaN）
    try:
        if pd.isna(value):
            return value
    except (TypeError, ValueError):
        pass

    if isinstance(value, bool) or isinstance(value, np.bool_):
        return bool(rng.randint(0, 1))

    if isinstance(value, (int, np.integer)):
        return _fake_int(int(value), rng)

    if isinstance(value, (float, np.floating)):
        return _fake_float(float(value), rng)

    if isinstance(value, pd.Timestamp):
        delta = rng.randint(-30, 30)
        return value + pd.Timedelta(days=delta)

    if isinstance(value, datetime.datetime):
        return value + datetime.timedelta(days=rng.randint(-30, 30))

    if isinstance(value, datetime.date):
        return value + datetime.timedelta(days=rng.randint(-30, 30))

    if isinstance(value, str):
        return _fake_string(value, rng)

    return value


def anonymize_df(df: pd.DataFrame, seed: int = 42) -> pd.DataFrame:
    """返回脱敏后的 DataFrame 副本，不修改入参。"""
    rng = random.Random(seed)
    out = df.copy()
    for col in out.columns:
        out[col] = out[col].map(lambda v: _fake_value(v, rng))
    return out
