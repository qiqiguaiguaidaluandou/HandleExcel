import { AlertCircle, FileSpreadsheet, Sparkles, User as UserIcon } from "lucide-react";

import type { Message } from "@/utils/types";
import { CodeCard } from "./CodeCard";
import { ResultCard } from "./ResultCard";

export function MessageBubble({
  msg,
  onExecute,
}: {
  msg: Message;
  onExecute: (id: string, jobId: string) => void;
}) {
  if (msg.role === "user") {
    return (
      <div className="flex gap-3 justify-end animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="max-w-[80%] flex flex-col items-end gap-2">
          {msg.files && msg.files.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-end">
              {msg.files.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 text-sm bg-white dark:bg-zinc-900 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 rounded-xl px-3 py-1.5 shadow-sm">
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>{f.name}</span>
                </div>
              ))}
            </div>
          )}
          {msg.text && (
            <div className="rounded-3xl rounded-tr-md bg-gradient-to-br from-emerald-400 to-emerald-500 text-white px-5 py-3 text-base whitespace-pre-wrap shadow-sm shadow-emerald-500/20 leading-relaxed">
              {msg.text}
            </div>
          )}
        </div>
        <div className="shrink-0 w-9 h-9 rounded-2xl bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center shadow-sm">
          <UserIcon className="w-4 h-4 text-zinc-600 dark:text-zinc-300" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="shrink-0 w-9 h-9 rounded-2xl bg-gradient-to-br from-emerald-300 to-emerald-500 flex items-center justify-center shadow-sm">
        <Sparkles className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        {msg.kind === "text" && (
          <div className="rounded-3xl rounded-tl-md bg-white dark:bg-zinc-900 border border-emerald-100/80 dark:border-emerald-950/50 px-5 py-3 text-base text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap shadow-sm leading-relaxed">
            {msg.text}
          </div>
        )}
        {msg.kind === "error" && (
          <div className="rounded-3xl rounded-tl-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-5 py-3 text-base text-red-700 dark:text-red-300 whitespace-pre-wrap flex items-start gap-2 shadow-sm">
            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
            <div>{msg.text}</div>
          </div>
        )}
        {msg.kind === "code" && <CodeCard msg={msg} onExecute={onExecute} />}
        {msg.kind === "result" && <ResultCard msg={msg} />}
      </div>
    </div>
  );
}
