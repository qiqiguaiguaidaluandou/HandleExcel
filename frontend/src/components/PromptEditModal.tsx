"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";

import type { PromptButton } from "@/utils/types";

export function PromptEditModal({
  state,
  onClose,
  onSave,
}: {
  state: { mode: "new" } | { mode: "edit"; prompt: PromptButton };
  onClose: () => void;
  onSave: (title: string, content: string, id?: number) => Promise<void>;
}) {
  const isEdit = state.mode === "edit";
  const [title, setTitle] = useState(isEdit ? state.prompt.title : "");
  const [content, setContent] = useState(isEdit ? state.prompt.content : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSave = title.trim().length > 0 && content.trim().length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(title.trim(), content.trim(), isEdit ? state.prompt.id : undefined);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 border border-emerald-100 dark:border-emerald-900/50 shadow-2xl p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {isEdit ? "编辑提示词" : "新增提示词"}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-zinc-500 dark:text-zinc-400">按钮标题</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：按月汇总"
            maxLength={30}
            className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-950/50"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-zinc-500 dark:text-zinc-400">提示词内容</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="点击按钮时会把这段内容填入输入框"
            rows={8}
            className="w-full resize-none rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-950/50"
          />
        </div>
        {error && <div className="text-xs text-red-500">{error}</div>}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-300 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="px-4 py-2 text-sm font-medium text-white rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-500 hover:from-emerald-500 hover:to-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-emerald-500/30 inline-flex items-center gap-1.5"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
