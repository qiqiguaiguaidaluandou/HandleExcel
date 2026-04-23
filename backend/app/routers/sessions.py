import os
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from .. import executor, llm
from ..storage import jobs
from ..config import OUTPUT_DIR, UPLOAD_DIR
from ..excel_utils import inspect_file

router = APIRouter(prefix="/api", tags=["sessions"])


@router.post("/analyze")
async def analyze(
    requirement: str = Form(...),
    files: list[UploadFile] = File(...),
):
    if not files:
        raise HTTPException(400, "至少上传一个文件")

    saved_paths: list[str] = []
    original_names: list[str] = []
    file_metas: list[dict] = []
    for f in files:
        suffix = Path(f.filename or "").suffix
        if suffix.lower() not in {".xlsx", ".xls", ".xlsm", ".csv"}:
            raise HTTPException(400, f"不支持的文件类型: {f.filename}")
        content = await f.read()
        dest = UPLOAD_DIR / f"{uuid.uuid4().hex}{suffix}"
        dest.write_bytes(content)
        saved_paths.append(str(dest))
        original_names.append(f.filename or dest.name)
        file_metas.append({"name": f.filename or dest.name, "size": len(content)})

    anonymize = os.getenv("ANONYMIZE_SAMPLES", "true").lower() not in {"0", "false", "no"}
    try:
        files_info = [inspect_file(p, anonymize=anonymize) for p in saved_paths]
    except Exception as e:
        raise HTTPException(400, f"读取文件失败: {e}")

    for info, name in zip(files_info, original_names):
        info["filename"] = name

    try:
        result = llm.generate_code(files_info, requirement)
    except Exception as e:
        raise HTTPException(500, f"调用大模型失败: {e}")

    job = jobs.create(saved_paths, original_names, requirement)
    jobs.update(
        job.job_id,
        code=result["code"],
        explanation=result.get("explanation", ""),
        history=result.get("_history", []),
    )
    jobs.add_message(job.job_id, "user", "user", {
        "text": requirement,
        "files": file_metas,
    })
    jobs.add_message(job.job_id, "assistant", "code", {
        "code": result["code"],
        "explanation": result.get("explanation", ""),
        "status": "pending",
    })

    return {
        "job_id": job.job_id,
        "code": result["code"],
        "explanation": result.get("explanation", ""),
        "files_info": files_info,
    }


@router.post("/revise")
async def revise(job_id: str = Form(...), instruction: str = Form(...)):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "任务不存在")

    try:
        result = llm.generate_code([], instruction, history=job.history)
    except Exception as e:
        raise HTTPException(500, f"调用大模型失败: {e}")

    jobs.update(
        job.job_id,
        code=result["code"],
        explanation=result.get("explanation", ""),
        history=result.get("_history", []),
    )
    jobs.add_message(job.job_id, "user", "user", {
        "text": instruction,
        "files": [],
    })
    jobs.add_message(job.job_id, "assistant", "code", {
        "code": result["code"],
        "explanation": result.get("explanation", ""),
        "status": "pending",
    })
    return {
        "job_id": job.job_id,
        "code": result["code"],
        "explanation": result.get("explanation", ""),
    }


def _build_retry_instruction(stderr: str) -> str:
    tail = stderr[-2000:] if len(stderr) > 2000 else stderr
    return (
        "上一版代码执行时报错，请定位根因并修正，然后重新给出完整代码。\n"
        "要求：保留原需求意图，不要删改无关逻辑；不要重新定义或覆盖 "
        "INPUT_FILES / OUTPUT_FILE。\n\n"
        f"报错信息：\n```\n{tail}\n```"
    )


@router.post("/execute")
async def execute_endpoint(job_id: str = Form(...)):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "任务不存在")
    if not job.code:
        raise HTTPException(400, "任务没有可执行的代码")

    output_file = str(OUTPUT_DIR / f"{job.job_id}_result.xlsx")
    max_retries = max(0, int(os.getenv("EXEC_AUTO_RETRY", "2")))

    current_code = job.code
    current_history = list(job.history or [])

    for attempt in range(max_retries + 1):
        jobs.update(job.job_id, status="executing", output_file=output_file)

        is_safety_error = False
        try:
            result = executor.execute(current_code, job.input_files, output_file)
        except executor.CodeSafetyError as e:
            is_safety_error = True
            result = {"success": False, "stdout": "", "stderr": f"安全检查未通过: {e}"}

        if result["success"]:
            jobs.update(job.job_id, status="done", stdout=result["stdout"])
            jobs.update_last_message_of_kind(job.job_id, "code", {"status": "done"})
            jobs.add_message(job.job_id, "assistant", "result", {
                "stdout": result["stdout"],
            })
            return {
                "job_id": job.job_id,
                "status": "done",
                "stdout": result["stdout"],
                "download_url": f"/api/download/{job.job_id}",
                "retries": attempt,
            }

        err_text = result["stderr"]
        jobs.update_last_message_of_kind(job.job_id, "code", {
            "status": "failed",
            "runError": err_text,
        })

        if attempt >= max_retries:
            jobs.update(
                job.job_id,
                status="failed",
                error=err_text,
                stdout=result["stdout"],
            )
            if is_safety_error:
                raise HTTPException(400, err_text)
            return {
                "job_id": job.job_id,
                "status": "failed",
                "stdout": result["stdout"],
                "stderr": err_text,
                "retries": attempt,
            }

        try:
            fix = llm.generate_code(
                [],
                _build_retry_instruction(err_text),
                history=current_history,
            )
        except Exception as e:
            jobs.update(
                job.job_id,
                status="failed",
                error=err_text,
                stdout=result["stdout"],
            )
            if is_safety_error:
                raise HTTPException(400, err_text)
            return {
                "job_id": job.job_id,
                "status": "failed",
                "stdout": result["stdout"],
                "stderr": err_text,
                "retries": attempt,
                "retry_error": f"自动修复调 LLM 失败: {e}",
            }

        current_code = fix["code"]
        current_history = fix.get("_history", current_history)
        jobs.update(
            job.job_id,
            code=current_code,
            explanation=fix.get("explanation", ""),
            history=current_history,
        )
        jobs.add_message(job.job_id, "user", "user", {
            "text": f"[自动重试 {attempt + 1}/{max_retries}] 根据报错信息修正代码",
            "files": [],
            "auto": True,
        })
        jobs.add_message(job.job_id, "assistant", "code", {
            "code": current_code,
            "explanation": fix.get("explanation", ""),
            "status": "pending",
        })


@router.get("/preview/{job_id}")
def preview(job_id: str):
    job = jobs.get(job_id)
    if not job or not job.output_file or not Path(job.output_file).exists():
        raise HTTPException(404, "结果文件不存在")
    try:
        info = inspect_file(job.output_file, sample_rows=20)
    except Exception as e:
        raise HTTPException(500, f"读取结果失败: {e}")
    sheets_out = []
    for sheet_name, sheet in info["sheets"].items():
        sheets_out.append({
            "name": sheet_name,
            "columns": sheet["columns"],
            "row_count": sheet["row_count"],
            "rows": sheet["sample"],
        })
    return {"job_id": job_id, "sheets": sheets_out}


@router.get("/download/{job_id}")
def download(job_id: str):
    job = jobs.get(job_id)
    if not job or not job.output_file or not Path(job.output_file).exists():
        raise HTTPException(404, "结果文件不存在")
    return FileResponse(
        job.output_file,
        filename=f"result_{job_id}.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@router.get("/jobs")
def list_jobs():
    return {"jobs": jobs.list_all()}


@router.get("/job/{job_id}")
def get_job(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "任务不存在")
    return {
        "job_id": job.job_id,
        "title": job.title,
        "status": job.status,
        "code": job.code,
        "explanation": job.explanation,
        "error": job.error,
        "filenames": job.filenames,
        "has_output": bool(job.output_file and Path(job.output_file).exists()),
        "messages": jobs.list_messages(job.job_id),
        "created_at": job.created_at,
        "updated_at": job.updated_at,
    }


@router.delete("/job/{job_id}")
def delete_job(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "任务不存在")
    for p in job.input_files:
        Path(p).unlink(missing_ok=True)
    if job.output_file:
        Path(job.output_file).unlink(missing_ok=True)
    jobs.delete(job_id)
    return {"ok": True}
