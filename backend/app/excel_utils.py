from pathlib import Path

import pandas as pd

from .anonymize import anonymize_df

DEFAULT_SAMPLE_ROWS = 5


def inspect_file(
    filepath: str,
    sample_rows: int = DEFAULT_SAMPLE_ROWS,
    anonymize: bool = False,
) -> dict:
    """读取 Excel/CSV 的结构信息：每个 sheet 的列名、行数、前几行样本。

    anonymize=True 时，样本数据会被脱敏后返回（用于送给 LLM）；
    anonymize=False 时，返回真实样本（用于展示给用户）。
    """
    path = Path(filepath)
    suffix = path.suffix.lower()

    sheets: dict[str, dict] = {}

    if suffix in {".xlsx", ".xls", ".xlsm"}:
        xl = pd.ExcelFile(filepath)
        for sheet_name in xl.sheet_names:
            df = pd.read_excel(filepath, sheet_name=sheet_name)
            sheets[sheet_name] = _summarize(df, sample_rows, anonymize)
    elif suffix == ".csv":
        df = pd.read_csv(filepath)
        sheets["Sheet1"] = _summarize(df, sample_rows, anonymize)
    else:
        raise ValueError(f"不支持的文件类型: {suffix}")

    return {
        "filename": path.name,
        "sheets": sheets,
        "anonymized": anonymize,
    }


def _summarize(df: pd.DataFrame, sample_rows: int, anonymize: bool) -> dict:
    sample_df = df.head(sample_rows)
    if anonymize:
        sample_df = anonymize_df(sample_df)
    sample = sample_df.fillna("").to_dict(orient="records")
    return {
        "columns": list(df.columns.astype(str)),
        "row_count": int(len(df)),
        "sample": sample,
    }
