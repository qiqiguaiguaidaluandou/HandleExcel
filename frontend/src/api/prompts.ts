import { ApiError, apiFetch, apiJson } from "./client";
import type { PromptButton } from "@/utils/types";

export async function listPrompts(): Promise<PromptButton[]> {
  const data = await apiJson<{ prompts: PromptButton[] }>("/api/prompts");
  return data.prompts || [];
}

export async function savePrompt(title: string, content: string, id?: number): Promise<void> {
  const url = id ? `/api/prompts/${id}` : "/api/prompts";
  const method = id ? "PUT" : "POST";
  const resp = await apiFetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, content }),
  });
  if (!resp.ok) throw new ApiError(resp.status, await resp.text());
}

export async function deletePrompt(id: number): Promise<void> {
  const resp = await apiFetch(`/api/prompts/${id}`, { method: "DELETE" });
  if (!resp.ok && resp.status !== 404) {
    throw new ApiError(resp.status, await resp.text());
  }
}
