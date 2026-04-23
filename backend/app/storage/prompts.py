from typing import Optional

from .. import db


def list_all() -> list[dict]:
    with db.connect() as conn:
        rows = conn.execute(
            "SELECT id, title, content, created_at, updated_at FROM prompt_buttons ORDER BY id ASC"
        ).fetchall()
    return [dict(r) for r in rows]


def get(prompt_id: int) -> Optional[dict]:
    with db.connect() as conn:
        row = conn.execute(
            "SELECT id, title, content, created_at, updated_at FROM prompt_buttons WHERE id = ?",
            (prompt_id,),
        ).fetchone()
    return dict(row) if row else None


def create(title: str, content: str) -> dict:
    now = db.utcnow()
    with db.connect() as conn:
        cur = conn.execute(
            "INSERT INTO prompt_buttons (title, content, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (title, content, now, now),
        )
        new_id = cur.lastrowid
    return {
        "id": new_id,
        "title": title,
        "content": content,
        "created_at": now,
        "updated_at": now,
    }


def update(prompt_id: int, title: str, content: str) -> Optional[dict]:
    now = db.utcnow()
    with db.connect() as conn:
        cur = conn.execute(
            "UPDATE prompt_buttons SET title = ?, content = ?, updated_at = ? WHERE id = ?",
            (title, content, now, prompt_id),
        )
        if cur.rowcount == 0:
            return None
    return get(prompt_id)


def delete(prompt_id: int) -> bool:
    with db.connect() as conn:
        cur = conn.execute("DELETE FROM prompt_buttons WHERE id = ?", (prompt_id,))
        return cur.rowcount > 0
