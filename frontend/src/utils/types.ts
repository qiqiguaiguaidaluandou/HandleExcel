export type SheetData = {
  name: string;
  columns: string[];
  row_count: number;
  rows: Record<string, unknown>[];
};

export type Message =
  | { id: string; role: "assistant"; kind: "text"; text: string }
  | { id: string; role: "user"; text: string; files?: { name: string; size: number }[] }
  | {
      id: string;
      role: "assistant";
      kind: "code";
      jobId: string;
      code: string;
      explanation: string;
      status: "pending" | "running" | "done" | "failed";
      runError?: string;
    }
  | {
      id: string;
      role: "assistant";
      kind: "result";
      jobId: string;
      sheets: SheetData[];
      stdout?: string;
    }
  | { id: string; role: "assistant"; kind: "error"; text: string };

export type JobSummary = {
  job_id: string;
  title: string;
  status: string;
  filenames: string[];
  created_at: string;
  updated_at: string;
};

export type ServerMessage = {
  id: number;
  seq: number;
  role: "user" | "assistant";
  kind: "user" | "code" | "result";
  payload: {
    text?: string;
    files?: { name: string; size: number }[];
    code?: string;
    explanation?: string;
    status?: "pending" | "running" | "done" | "failed";
    runError?: string;
    stdout?: string;
  };
  created_at: string;
};

export type PromptButton = {
  id: number;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export type PromptModalState =
  | null
  | { mode: "new" }
  | { mode: "edit"; prompt: PromptButton };
