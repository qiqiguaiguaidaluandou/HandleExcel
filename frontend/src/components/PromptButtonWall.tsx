import { Check, Pencil, Plus, X } from "lucide-react";

import type { PromptButton } from "@/utils/types";

export function PromptButtonWall({
  prompts,
  editMode,
  onApply,
  onToggleEdit,
  onAdd,
  onEdit,
  onDelete,
}: {
  prompts: PromptButton[];
  editMode: boolean;
  onApply: (p: PromptButton) => void;
  onToggleEdit: () => void;
  onAdd: () => void;
  onEdit: (p: PromptButton) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="w-full h-full rounded-3xl bg-white/80 dark:bg-zinc-900/70 border border-emerald-200/70 dark:border-emerald-900/50 shadow-[0_4px_24px_-8px_rgba(16,185,129,0.25)] p-3 flex flex-col gap-2">
      <div className="shrink-0 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">提示词</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onAdd}
            title="新增提示词"
            className="p-1 rounded-md text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={onToggleEdit}
            title={editMode ? "完成编辑" : "编辑提示词"}
            className={`p-1 rounded-md ${
              editMode
                ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50"
                : "text-zinc-500 dark:text-zinc-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
            }`}
          >
            {editMode ? <Check className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {prompts.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center text-xs text-zinc-400 px-2 py-4">
            点击 + 新增常用提示词
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5 pr-0.5">
            {prompts.map((p) => (
              <button
                key={p.id}
                onClick={() => (editMode ? onEdit(p) : onApply(p))}
                title={editMode ? "点击编辑" : p.content}
                className={`group relative max-w-full text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
                  editMode
                    ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 pr-5"
                    : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                }`}
              >
                <span className="block truncate max-w-[180px]">{p.title}</span>
                {editMode && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(p.id);
                    }}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 shadow"
                  >
                    <X className="w-3 h-3" />
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
