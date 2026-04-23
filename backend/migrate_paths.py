"""一次性迁移脚本：重写 SQLite 中 jobs.input_files / jobs.output_file 的绝对路径前缀。

背景：Docker 化之前，上传/输出文件存在 backend/uploads/ 和 backend/outputs/，
DB 里存的是宿主绝对路径。迁移到 backend/data/{uploads,outputs}/ 并在容器内
挂载到 /data/ 后，需要把老绝对路径改写为 /data/{uploads,outputs}/{basename}。

脚本是幂等的：已经是新形态的记录不会重复改写。
用法：
    python backend/migrate_paths.py                  # 默认 /data 前缀
    python backend/migrate_paths.py --new-base=/foo  # 换前缀
"""
from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path


def rewrite_paths(paths: list[str], new_base: str, subdir: str) -> tuple[list[str], int]:
    """把绝对路径列表里的 .../uploads/ 或 .../outputs/ 前缀替换为 new_base/subdir/。

    如果路径已经以 {new_base}/{subdir}/ 开头，跳过。
    返回 (新列表, 实际改写条数)。
    """
    expected_prefix = f"{new_base.rstrip('/')}/{subdir}/"
    changed = 0
    out: list[str] = []
    for p in paths:
        if not p:
            out.append(p)
            continue
        if p.startswith(expected_prefix):
            out.append(p)
            continue
        basename = Path(p).name
        out.append(f"{expected_prefix}{basename}")
        changed += 1
    return out, changed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--db",
        default=str(Path(__file__).resolve().parent / "data" / "db.sqlite3"),
        help="SQLite 文件路径（默认 backend/data/db.sqlite3）",
    )
    parser.add_argument(
        "--new-base",
        default="/data",
        help="新的数据根目录（容器内路径，默认 /data）",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只打印将要改写的内容，不落库",
    )
    args = parser.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        raise SystemExit(f"DB 不存在: {db_path}")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT job_id, input_files, output_file FROM jobs").fetchall()

    total_jobs = 0
    total_input_rewrites = 0
    total_output_rewrites = 0

    for row in rows:
        job_id = row["job_id"]
        input_list = json.loads(row["input_files"]) if row["input_files"] else []
        output_file = row["output_file"]

        new_inputs, in_n = rewrite_paths(input_list, args.new_base, "uploads")
        new_output = output_file
        out_n = 0
        if output_file:
            new_output_list, out_n = rewrite_paths([output_file], args.new_base, "outputs")
            new_output = new_output_list[0]

        if in_n == 0 and out_n == 0:
            continue

        total_jobs += 1
        total_input_rewrites += in_n
        total_output_rewrites += out_n

        print(f"[{job_id}]")
        if in_n:
            print(f"  input_files: {input_list} -> {new_inputs}")
        if out_n:
            print(f"  output_file: {output_file} -> {new_output}")

        if not args.dry_run:
            conn.execute(
                "UPDATE jobs SET input_files = ?, output_file = ? WHERE job_id = ?",
                (json.dumps(new_inputs), new_output, job_id),
            )

    if not args.dry_run:
        conn.commit()
    conn.close()

    mode = "DRY RUN" if args.dry_run else "APPLIED"
    print(
        f"\n[{mode}] jobs changed: {total_jobs}, "
        f"input paths rewritten: {total_input_rewrites}, "
        f"output paths rewritten: {total_output_rewrites}"
    )


if __name__ == "__main__":
    main()
