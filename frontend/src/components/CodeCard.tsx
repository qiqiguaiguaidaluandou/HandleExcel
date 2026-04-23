"use client";

import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Code2, Loader2,
} from "lucide-react";

import type { Message } from "@/utils/types";

export function CodeCard({
  msg,
  onExecute,
}: {
  msg: Extract<Message, { kind: "code" }>;
  onExecute: (id: string, jobId: string) => void;
}) {
  const [showCode, setShowCode] = useState(false);
  return (
    <div className="rounded-3xl rounded-tl-md bg-white dark:bg-zinc-900 border border-emerald-100/80 dark:border-emerald-950/50 shadow-sm overflow-hidden">
      {msg.explanation && (
        <div className="px-5 py-3.5 text-base text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed">
          {msg.explanation}
        </div>
      )}
      {showCode && (
        <div className="border-t border-emerald-100/80 dark:border-emerald-950/50">
          <div className="px-5 py-2 text-xs text-zinc-500 bg-zinc-50/60 dark:bg-zinc-800/30 flex items-center justify-between">
            <span>生成的 Python 代码</span>
            <span className="font-mono text-zinc-400">job: {msg.jobId}</span>
          </div>
          <div className="max-h-96 overflow-auto">
            <SyntaxHighlighter
              language="python"
              style={oneDark}
              customStyle={{ margin: 0, fontSize: 12.5, padding: "12px 16px" }}
              showLineNumbers
            >
              {msg.code}
            </SyntaxHighlighter>
          </div>
        </div>
      )}
      <div className="px-5 py-3 border-t border-emerald-100/80 dark:border-emerald-950/50 bg-emerald-50/40 dark:bg-emerald-950/20 flex items-center gap-2 flex-wrap">
        {msg.status === "pending" && (
          <>
            <button
              onClick={() => onExecute(msg.id, msg.jobId)}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-500 hover:from-emerald-500 hover:to-emerald-600 text-white px-4 py-2 text-sm font-medium shadow-sm shadow-emerald-500/30 transition-all hover:scale-[1.02] active:scale-95"
            >
              <CheckCircle2 className="w-4 h-4" />
              确认执行
            </button>
            <button
              onClick={() => setShowCode((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/70 dark:border-emerald-800 bg-white dark:bg-zinc-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 px-3.5 py-2 text-sm font-medium transition-colors"
            >
              <Code2 className="w-4 h-4" />
              {showCode ? "收起代码" : "查看代码"}
              {showCode ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            <span className="text-sm text-zinc-500 ml-auto">不满意？在下方输入框告诉我怎么改</span>
          </>
        )}
        {msg.status === "running" && (
          <div className="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
            <Loader2 className="w-4 h-4 animate-spin" /> 执行中…
          </div>
        )}
        {msg.status === "done" && (
          <>
            <div className="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" /> 已执行
            </div>
            <button
              onClick={() => setShowCode((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/70 dark:border-emerald-800 bg-white dark:bg-zinc-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 px-3 py-1.5 text-xs font-medium transition-colors ml-auto"
            >
              <Code2 className="w-3.5 h-3.5" />
              {showCode ? "收起代码" : "查看代码"}
            </button>
          </>
        )}
        {msg.status === "failed" && (
          <div className="flex flex-col gap-2 w-full">
            <div className="inline-flex items-center gap-1.5 text-sm text-red-600">
              <AlertCircle className="w-4 h-4" /> 执行失败
            </div>
            {msg.runError && (
              <pre className="text-xs bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 p-3 rounded-xl border border-red-200 dark:border-red-900 whitespace-pre-wrap max-h-48 overflow-auto">
                {msg.runError}
              </pre>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => onExecute(msg.id, msg.jobId)}
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-zinc-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 px-3.5 py-1.5 text-sm font-medium transition-colors"
              >
                重试
              </button>
              <span className="self-center text-sm text-zinc-500">或在下方输入框描述改动</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
