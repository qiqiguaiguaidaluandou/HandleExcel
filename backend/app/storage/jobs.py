import json
import uuid
from dataclasses import dataclass, field
from typing import Optional

from .. import db


@dataclass
class Job:
    job_id: str
    input_files: list[str]
    filenames: list[str]
    requirement: str
    title: str = ""
    code: str = ""
    explanation: str = ""
    history: list[dict] = field(default_factory=list)
    output_file: Optional[str] = None
    status: str = "pending_confirm"
    error: Optional[str] = None
    stdout: Optional[str] = None
    created_at: str = ""
    updated_at: str = ""


ALLOWED_FIELDS = {
    "code", "explanation", "history", "output_file",
    "status", "error", "stdout", "title",
}


def _row_to_job(row) -> Job:
    return Job(
        job_id=row["job_id"],
        input_files=json.loads(row["input_files"]),
        filenames=json.loads(row["filenames"]),
        requirement=row["requirement"],
        title=row["title"],
        code=row["code"] or "",
        explanation=row["explanation"] or "",
        history=json.loads(row["history"]) if row["history"] else [],
        output_file=row["output_file"],
        status=row["status"],
        error=row["error"],
        stdout=row["stdout"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _make_title(requirement: str) -> str:
    s = (requirement or "").strip().replace("\n", " ")
    return s[:30] if s else "未命名会话"


def create(input_files: list[str], filenames: list[str], requirement: str) -> Job:
    job_id = uuid.uuid4().hex[:12]
    now = db.utcnow()
    title = _make_title(requirement)
    with db.connect() as conn:
        conn.execute(
            """INSERT INTO jobs
               (job_id, title, requirement, input_files, filenames, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                job_id, title, requirement,
                json.dumps(input_files), json.dumps(filenames),
                now, now,
            ),
        )
    return Job(
        job_id=job_id,
        input_files=input_files,
        filenames=filenames,
        requirement=requirement,
        title=title,
        created_at=now,
        updated_at=now,
    )


def get(job_id: str) -> Optional[Job]:
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
    return _row_to_job(row) if row else None


def update(job_id: str, **fields) -> Optional[Job]:
    cols: list[str] = []
    values: list = []
    for k, v in fields.items():
        if k not in ALLOWED_FIELDS:
            continue
        if k == "history":
            v = json.dumps(v)
        cols.append(f"{k} = ?")
        values.append(v)
    if not cols:
        return get(job_id)
    cols.append("updated_at = ?")
    values.append(db.utcnow())
    values.append(job_id)
    with db.connect() as conn:
        conn.execute(f"UPDATE jobs SET {', '.join(cols)} WHERE job_id = ?", values)
    return get(job_id)


def list_all() -> list[dict]:
    with db.connect() as conn:
        rows = conn.execute(
            """SELECT job_id, title, status, filenames, created_at, updated_at
               FROM jobs ORDER BY updated_at DESC"""
        ).fetchall()
    return [
        {
            "job_id": r["job_id"],
            "title": r["title"],
            "status": r["status"],
            "filenames": json.loads(r["filenames"]),
            "created_at": r["created_at"],
            "updated_at": r["updated_at"],
        }
        for r in rows
    ]


def delete(job_id: str) -> Optional[Job]:
    job = get(job_id)
    if not job:
        return None
    with db.connect() as conn:
        conn.execute("DELETE FROM messages WHERE job_id = ?", (job_id,))
        conn.execute("DELETE FROM jobs WHERE job_id = ?", (job_id,))
    return job


# ---- messages ----

def add_message(job_id: str, role: str, kind: str, payload: dict) -> int:
    now = db.utcnow()
    with db.connect() as conn:
        row = conn.execute(
            "SELECT COALESCE(MAX(seq), -1) + 1 AS next_seq FROM messages WHERE job_id = ?",
            (job_id,),
        ).fetchone()
        next_seq = row["next_seq"]
        cur = conn.execute(
            """INSERT INTO messages (job_id, seq, role, kind, payload, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (job_id, next_seq, role, kind, json.dumps(payload, ensure_ascii=False), now),
        )
        conn.execute(
            "UPDATE jobs SET updated_at = ? WHERE job_id = ?",
            (now, job_id),
        )
        return cur.lastrowid


def list_messages(job_id: str) -> list[dict]:
    with db.connect() as conn:
        rows = conn.execute(
            """SELECT id, seq, role, kind, payload, created_at
               FROM messages WHERE job_id = ? ORDER BY seq""",
            (job_id,),
        ).fetchall()
    return [
        {
            "id": r["id"],
            "seq": r["seq"],
            "role": r["role"],
            "kind": r["kind"],
            "payload": json.loads(r["payload"]),
            "created_at": r["created_at"],
        }
        for r in rows
    ]


def update_last_message_of_kind(job_id: str, kind: str, patch: dict) -> Optional[int]:
    with db.connect() as conn:
        row = conn.execute(
            """SELECT id, payload FROM messages
               WHERE job_id = ? AND kind = ? ORDER BY seq DESC LIMIT 1""",
            (job_id, kind),
        ).fetchone()
        if not row:
            return None
        payload = json.loads(row["payload"])
        payload.update(patch)
        conn.execute(
            "UPDATE messages SET payload = ? WHERE id = ?",
            (json.dumps(payload, ensure_ascii=False), row["id"]),
        )
        return row["id"]
