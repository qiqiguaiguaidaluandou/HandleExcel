from fastapi import APIRouter, Body, HTTPException

from ..storage import prompts as prompts_store

router = APIRouter(prefix="/api/prompts", tags=["prompts"])


@router.get("")
def list_prompts():
    return {"prompts": prompts_store.list_all()}


@router.post("")
def create_prompt(payload: dict = Body(...)):
    title = (payload.get("title") or "").strip()
    content = (payload.get("content") or "").strip()
    if not title:
        raise HTTPException(400, "title 不能为空")
    if not content:
        raise HTTPException(400, "content 不能为空")
    return prompts_store.create(title, content)


@router.put("/{prompt_id}")
def update_prompt(prompt_id: int, payload: dict = Body(...)):
    title = (payload.get("title") or "").strip()
    content = (payload.get("content") or "").strip()
    if not title:
        raise HTTPException(400, "title 不能为空")
    if not content:
        raise HTTPException(400, "content 不能为空")
    result = prompts_store.update(prompt_id, title, content)
    if result is None:
        raise HTTPException(404, "提示词不存在")
    return result


@router.delete("/{prompt_id}")
def delete_prompt(prompt_id: int):
    if not prompts_store.delete(prompt_id):
        raise HTTPException(404, "提示词不存在")
    return {"ok": True}
