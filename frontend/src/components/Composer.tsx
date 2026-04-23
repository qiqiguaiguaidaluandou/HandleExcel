"use client";

import type { ReactNode, RefObject } from "react";
import {
  ArrowUp, FileSpreadsheet, Loader2, Paperclip, X,
} from "lucide-react";

export function Composer({
  input,
  onInputChange,
  pendingFiles,
  onFilesPicked,
  onRemoveFile,
  sending,
  hasSession,
  onSend,
  textareaRef,
  fileInputRef,
  promptWall,
}: {
  input: string;
  onInputChange: (v: string) => void;
  pendingFiles: File[];
  onFilesPicked: (files: File[]) => void;
  onRemoveFile: (idx: number) => void;
  sending: boolean;
  hasSession: boolean;
  onSend: () => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  promptWall?: ReactNode;
}) {
  const attachDisabled = sending || hasSession;

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!sending) onSend();
    }
  };

  return (
    <div className="shrink-0 px-4 pb-5 pt-2">
      <div className="max-w-4xl mx-auto">
        <div className="relative">
          {promptWall && (
            <div className="hidden xl:block absolute right-full top-0 bottom-0 w-64 pr-3">
              {promptWall}
            </div>
          )}
          <div
            onClick={() => textareaRef.current?.focus()}
            className="rounded-3xl bg-white dark:bg-zinc-900 border border-emerald-200/70 dark:border-emerald-900/50 shadow-[0_4px_24px_-8px_rgba(16,185,129,0.25)] focus-within:border-emerald-400 focus-within:ring-4 focus-within:ring-emerald-100 dark:focus-within:ring-emerald-950/50 transition-all px-3 pt-3 pb-2"
          >
            {pendingFiles.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2 px-1">
                {pendingFiles.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-sm bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 rounded-xl pl-2.5 pr-1.5 py-1.5"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span className="font-medium">{f.name}</span>
                    <span className="text-xs text-emerald-500/80">{(f.size / 1024).toFixed(1)}KB</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onRemoveFile(i); }}
                      className="ml-0.5 w-5 h-5 rounded-full hover:bg-emerald-200 dark:hover:bg-emerald-900 flex items-center justify-center"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={onKeyDown}
              rows={3}
              placeholder={
                hasSession
                  ? "继续对话 · 例：再按月份分组；把等级改成 ABC 三档"
                  : "描述你要如何处理上传的表格（Enter 发送，Shift+Enter 换行）"
              }
              className="w-full resize-none bg-transparent px-2 py-1 text-base text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none min-h-[72px] max-h-52"
            />

            <div className="flex items-center justify-between gap-2 px-1">
              <button
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                disabled={attachDisabled}
                title={hasSession ? "当前会话只处理初始上传的文件，新对话可重新上传" : "附加 Excel/CSV"}
                className="group flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 disabled:text-zinc-400 dark:disabled:text-zinc-600 disabled:hover:bg-transparent disabled:cursor-not-allowed rounded-full px-3 py-1.5 transition-colors"
              >
                <Paperclip className="w-4 h-4" />
                <span className="font-medium">附件</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".xlsx,.xls,.xlsm,.csv"
                onChange={(e) => {
                  const target = e.target;
                  const picked = target.files ? Array.from(target.files) : [];
                  target.value = "";
                  onFilesPicked(picked);
                }}
                className="hidden"
              />
              <button
                onClick={(e) => { e.stopPropagation(); onSend(); }}
                disabled={sending || (!input.trim() && pendingFiles.length === 0)}
                className="shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-500 hover:from-emerald-500 hover:to-emerald-600 text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-emerald-500/30 transition-all hover:scale-[1.04] active:scale-95"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-zinc-400">
          {hasSession ? "继续描述调整需求即可多轮迭代" : "首次发送需附上至少一个文件"}
        </p>
      </div>
    </div>
  );
}
