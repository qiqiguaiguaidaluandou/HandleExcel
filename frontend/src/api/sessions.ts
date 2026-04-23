import { API_BASE, ApiError, apiFetch, apiJson } from "./client";
import type { JobSummary, ServerMessage, SheetData } from "@/utils/types";

export type AnalyzeResponse = {
  job_id: string;
  code: string;
  explanation: string;
  files_info: unknown[];
};

export type ReviseResponse = {
  job_id: string;
  code: string;
  explanation: string;
};

export type ExecuteResponse = {
  job_id: string;
  status: "done" | "failed";
  stdout?: string;
  stderr?: string;
  download_url?: string;
  retries?: number;
};

export type PreviewResponse = {
  job_id: string;
  sheets: SheetData[];
};

export type JobDetail = {
  job_id: string;
  title: string;
  status: string;
  code: string;
  explanation: string;
  error: string | null;
  filenames: string[];
  has_output: boolean;
  messages: ServerMessage[];
  created_at: string;
  updated_at: string;
};

export async function analyze(requirement: string, files: File[]): Promise<AnalyzeResponse> {
  const fd = new FormData();
  fd.append("requirement", requirement);
  files.forEach((f) => fd.append("files", f));
  return apiJson<AnalyzeResponse>("/api/analyze", { method: "POST", body: fd });
}

export async function revise(jobId: string, instruction: string): Promise<ReviseResponse> {
  const fd = new FormData();
  fd.append("job_id", jobId);
  fd.append("instruction", instruction);
  return apiJson<ReviseResponse>("/api/revise", { method: "POST", body: fd });
}

export async function execute(jobId: string): Promise<ExecuteResponse> {
  const fd = new FormData();
  fd.append("job_id", jobId);
  return apiJson<ExecuteResponse>("/api/execute", { method: "POST", body: fd });
}

export async function fetchPreview(jobId: string): Promise<PreviewResponse> {
  return apiJson<PreviewResponse>(`/api/preview/${jobId}`);
}

export async function listJobs(): Promise<JobSummary[]> {
  const data = await apiJson<{ jobs: JobSummary[] }>("/api/jobs");
  return data.jobs || [];
}

export async function getJob(jobId: string): Promise<JobDetail> {
  return apiJson<JobDetail>(`/api/job/${jobId}`);
}

export async function deleteJob(jobId: string): Promise<void> {
  const resp = await apiFetch(`/api/job/${jobId}`, { method: "DELETE" });
  if (!resp.ok && resp.status !== 404) {
    throw new ApiError(resp.status, await resp.text());
  }
}

export function downloadUrl(jobId: string): string {
  return `${API_BASE}/api/download/${jobId}`;
}
