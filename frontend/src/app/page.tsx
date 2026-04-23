"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PanelLeft, PanelLeftClose } from "lucide-react";

import { Composer } from "@/components/Composer";
import { MessageList } from "@/components/MessageList";
import { PromptButtonWall } from "@/components/PromptButtonWall";
import { PromptEditModal } from "@/components/PromptEditModal";
import { Sidebar } from "@/components/Sidebar";

import { ApiError } from "@/api/client";
import {
  analyze, deleteJob, execute, fetchPreview, getJob, listJobs, revise,
} from "@/api/sessions";
import { deletePrompt as apiDeletePrompt, listPrompts, savePrompt as apiSavePrompt } from "@/api/prompts";

import { WELCOME } from "@/utils/constants";
import { uid } from "@/utils/format";
import type {
  JobSummary, Message, PromptButton, PromptModalState, SheetData,
} from "@/utils/types";

const isJobLostError = (text: string) => text.includes("任务不存在");

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [sessionJobId, setSessionJobId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loadingJob, setLoadingJob] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [prompts, setPrompts] = useState<PromptButton[]>([]);
  const [promptEditMode, setPromptEditMode] = useState(false);
  const [promptModal, setPromptModal] = useState<PromptModalState>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const refreshJobs = useCallback(async () => {
    try {
      setJobs(await listJobs());
    } catch {
      // 后端不可用时静默
    }
  }, []);

  useEffect(() => {
    refreshJobs();
  }, [refreshJobs]);

  const refreshPrompts = useCallback(async () => {
    try {
      setPrompts(await listPrompts());
    } catch {
      // 后端不可用时静默
    }
  }, []);

  useEffect(() => {
    refreshPrompts();
  }, [refreshPrompts]);

  const pushMsg = (m: Message) => setMessages((arr) => [...arr, m]);
  const updateMsg = (id: string, patch: Partial<Message>) =>
    setMessages((arr) => arr.map((m) => (m.id === id ? ({ ...m, ...patch } as Message) : m)));

  const handleJobLost = () => {
    setSessionJobId(null);
    pushMsg({
      id: uid(),
      role: "assistant",
      kind: "error",
      text: "该会话在后端已不存在（可能已被删除）。请在左侧选择其他会话或开始新对话。",
    });
    refreshJobs();
  };

  const startNewChat = () => {
    setMessages([WELCOME]);
    setSessionJobId(null);
    setPendingFiles([]);
    setInput("");
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const isFreshChat =
    sessionJobId === null &&
    pendingFiles.length === 0 &&
    input === "" &&
    messages.length === 1 &&
    messages[0].id === "welcome";

  const loadSession = async (jobId: string) => {
    if (loadingJob) return;
    setLoadingJob(jobId);
    try {
      const data = await getJob(jobId);
      const serverMessages = data.messages || [];
      const hasResult = serverMessages.some((m) => m.kind === "result");
      let sheets: SheetData[] = [];
      if (hasResult && data.has_output) {
        try {
          const preview = await fetchPreview(jobId);
          sheets = preview.sheets || [];
        } catch {
          // ignore preview error
        }
      }
      const rebuilt: Message[] = [WELCOME];
      for (const m of serverMessages) {
        if (m.kind === "user") {
          rebuilt.push({
            id: uid(),
            role: "user",
            text: m.payload.text || "",
            files: m.payload.files || [],
          });
        } else if (m.kind === "code") {
          rebuilt.push({
            id: uid(),
            role: "assistant",
            kind: "code",
            jobId,
            code: m.payload.code || "",
            explanation: m.payload.explanation || "",
            status: m.payload.status || "pending",
            runError: m.payload.runError,
          });
        } else if (m.kind === "result") {
          rebuilt.push({
            id: uid(),
            role: "assistant",
            kind: "result",
            jobId,
            sheets,
            stdout: m.payload.stdout || "",
          });
        }
      }
      setSessionJobId(jobId);
      setMessages(rebuilt);
      setPendingFiles([]);
      setInput("");
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        await refreshJobs();
        return;
      }
      pushMsg({
        id: uid(),
        role: "assistant",
        kind: "error",
        text: `加载会话失败：${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setLoadingJob(null);
    }
  };

  const deleteSession = async (jobId: string) => {
    if (!confirm("确认删除这个会话？对应的上传文件和结果也会被清理。")) return;
    try {
      await deleteJob(jobId);
      if (sessionJobId === jobId) startNewChat();
      await refreshJobs();
    } catch (e) {
      pushMsg({
        id: uid(),
        role: "assistant",
        kind: "error",
        text: `删除失败：${e instanceof Error ? e.message : String(e)}`,
      });
    }
  };

  const handleFilesPicked = (picked: File[]) => {
    if (picked.length === 0) return;
    setPendingFiles((prev) => [...prev, ...picked]);
  };

  const removePendingFile = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const applyPrompt = (p: PromptButton) => {
    setInput(p.content);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(p.content.length, p.content.length);
      }
    });
  };

  const savePrompt = async (title: string, content: string, id?: number) => {
    await apiSavePrompt(title, content, id);
    await refreshPrompts();
  };

  const deletePrompt = async (id: number) => {
    if (!confirm("确认删除这个提示词？")) return;
    try {
      await apiDeletePrompt(id);
      await refreshPrompts();
    } catch (e) {
      alert(`删除失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text && pendingFiles.length === 0) return;

    const userMsg: Message = {
      id: uid(),
      role: "user",
      text,
      files: pendingFiles.map((f) => ({ name: f.name, size: f.size })),
    };
    pushMsg(userMsg);
    const filesSnapshot = pendingFiles;
    setInput("");
    setPendingFiles([]);
    setSending(true);

    const isFirstTurn = sessionJobId === null;

    if (isFirstTurn) {
      if (filesSnapshot.length === 0) {
        pushMsg({
          id: uid(), role: "assistant", kind: "error",
          text: "首次对话需要上传至少一个 Excel/CSV 文件作为处理对象。",
        });
        setSending(false);
        return;
      }
      if (!text) {
        pushMsg({
          id: uid(), role: "assistant", kind: "error",
          text: "请描述你希望如何处理这些表格。",
        });
        setSending(false);
        return;
      }
      try {
        const data = await analyze(text, filesSnapshot);
        setSessionJobId(data.job_id);
        pushMsg({
          id: uid(), role: "assistant", kind: "code",
          jobId: data.job_id, code: data.code, explanation: data.explanation,
          status: "pending",
        });
        refreshJobs();
      } catch (e) {
        pushMsg({
          id: uid(), role: "assistant", kind: "error",
          text: `生成代码失败：${e instanceof Error ? e.message : String(e)}`,
        });
      } finally {
        setSending(false);
      }
    } else {
      if (!text) {
        pushMsg({
          id: uid(), role: "assistant", kind: "error",
          text: "请输入你希望的修改内容。",
        });
        setSending(false);
        return;
      }
      try {
        const data = await revise(sessionJobId, text);
        pushMsg({
          id: uid(), role: "assistant", kind: "code",
          jobId: data.job_id, code: data.code, explanation: data.explanation,
          status: "pending",
        });
        refreshJobs();
      } catch (e) {
        if (e instanceof ApiError && e.status === 404 && isJobLostError(e.message)) {
          handleJobLost();
          return;
        }
        pushMsg({
          id: uid(), role: "assistant", kind: "error",
          text: `修改失败：${e instanceof Error ? e.message : String(e)}`,
        });
      } finally {
        setSending(false);
      }
    }
  };

  const executeCode = async (msgId: string, jobId: string) => {
    updateMsg(msgId, { status: "running" } as Partial<Message>);
    try {
      const data = await execute(jobId);
      if (data.status === "done") {
        updateMsg(msgId, { status: "done" } as Partial<Message>);
        const preview = await fetchPreview(jobId);
        pushMsg({
          id: uid(), role: "assistant", kind: "result",
          jobId, sheets: preview.sheets, stdout: data.stdout,
        });
      } else {
        updateMsg(msgId, {
          status: "failed",
          runError: data.stderr || "执行失败",
        } as Partial<Message>);
      }
      refreshJobs();
    } catch (e) {
      if (e instanceof ApiError && e.status === 404 && isJobLostError(e.message)) {
        updateMsg(msgId, { status: "pending" } as Partial<Message>);
        handleJobLost();
        return;
      }
      updateMsg(msgId, {
        status: "failed",
        runError: e instanceof Error ? e.message : String(e),
      } as Partial<Message>);
    }
  };

  return (
    <div className="h-screen w-full flex flex-col bg-gradient-to-b from-emerald-50 via-white to-white dark:from-emerald-950/30 dark:via-zinc-950 dark:to-zinc-950">
      <header className="shrink-0 border-b border-emerald-100/80 dark:border-emerald-950/50 bg-white/70 dark:bg-zinc-900/70 backdrop-blur">
        <div className="px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="p-1.5 rounded-lg text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
            title={sidebarOpen ? "收起会话列表" : "打开会话列表"}
          >
            {sidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeft className="w-5 h-5" />}
          </button>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 tracking-tight">报表处理</h1>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <Sidebar
          open={sidebarOpen}
          jobs={jobs}
          activeId={sessionJobId}
          loadingId={loadingJob}
          disableNew={isFreshChat}
          onNew={startNewChat}
          onSelect={loadSession}
          onDelete={deleteSession}
        />

        <div className="flex-1 min-w-0 flex flex-col">
          <MessageList messages={messages} sending={sending} onExecute={executeCode} />

          <Composer
            input={input}
            onInputChange={setInput}
            pendingFiles={pendingFiles}
            onFilesPicked={handleFilesPicked}
            onRemoveFile={removePendingFile}
            sending={sending}
            hasSession={sessionJobId !== null}
            onSend={send}
            textareaRef={textareaRef}
            fileInputRef={fileInputRef}
            promptWall={
              <PromptButtonWall
                prompts={prompts}
                editMode={promptEditMode}
                onApply={applyPrompt}
                onToggleEdit={() => setPromptEditMode((v) => !v)}
                onAdd={() => setPromptModal({ mode: "new" })}
                onEdit={(p) => setPromptModal({ mode: "edit", prompt: p })}
                onDelete={deletePrompt}
              />
            }
          />
        </div>
      </div>

      {promptModal && (
        <PromptEditModal
          key={promptModal.mode === "edit" ? `edit-${promptModal.prompt.id}` : "new"}
          state={promptModal}
          onClose={() => setPromptModal(null)}
          onSave={savePrompt}
        />
      )}
    </div>
  );
}
