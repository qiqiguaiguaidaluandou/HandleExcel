import { Loader2, MessageSquare, Plus, Trash2 } from "lucide-react";

import type { JobSummary } from "@/utils/types";
import { formatTime, statusLabel } from "@/utils/format";

export function Sidebar({
  open,
  jobs,
  activeId,
  loadingId,
  disableNew,
  onNew,
  onSelect,
  onDelete,
}: {
  open: boolean;
  jobs: JobSummary[];
  activeId: string | null;
  loadingId: string | null;
  disableNew: boolean;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <aside
      aria-hidden={!open}
      className={`shrink-0 h-full overflow-hidden transition-[width] duration-300 ease-out ${
        open ? "w-72" : "w-0"
      }`}
    >
      <div
        className={`w-72 h-full flex flex-col border-r border-emerald-100/80 dark:border-emerald-950/50 bg-white/60 dark:bg-zinc-950/60 backdrop-blur transition-opacity duration-300 ease-out ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="shrink-0 px-4 py-4 border-b border-emerald-100/80 dark:border-emerald-950/50">
          <button
            onClick={onNew}
            disabled={disableNew}
            title={disableNew ? "已经是新对话状态，可直接上传文件并描述需求" : "开始新对话"}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-500 hover:from-emerald-500 hover:to-emerald-600 text-white px-3 py-2 text-sm font-medium shadow-sm shadow-emerald-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-emerald-400 disabled:hover:to-emerald-500"
          >
            <Plus className="w-4 h-4" />
            新对话
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {jobs.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-zinc-400">暂无历史会话</div>
          ) : (
            <ul className="px-2 space-y-0.5">
              {jobs.map((j) => {
                const active = j.job_id === activeId;
                const loading = j.job_id === loadingId;
                return (
                  <li key={j.job_id}>
                    <div
                      onClick={() => onSelect(j.job_id)}
                      className={`group flex items-start gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                        active
                          ? "bg-emerald-100/80 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-100"
                          : "hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      <MessageSquare className={`w-4 h-4 mt-0.5 shrink-0 ${active ? "text-emerald-600" : "text-zinc-400"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{j.title || "未命名会话"}</div>
                        <div className="mt-0.5 text-xs text-zinc-400 truncate">
                          {formatTime(j.updated_at)} · {statusLabel(j.status)}
                        </div>
                      </div>
                      {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-500 shrink-0" />
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete(j.job_id); }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-opacity"
                          title="删除会话"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}
