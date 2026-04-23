"use client";

import { useState } from "react";
import { CheckCircle2, Download } from "lucide-react";

import type { Message } from "@/utils/types";
import { formatCell } from "@/utils/format";
import { downloadUrl } from "@/api/sessions";

export function ResultCard({ msg }: { msg: Extract<Message, { kind: "result" }> }) {
  const [activeSheet, setActiveSheet] = useState(0);
  const sheet = msg.sheets[activeSheet];
  return (
    <div className="rounded-3xl rounded-tl-md bg-white dark:bg-zinc-900 border border-emerald-200/70 dark:border-emerald-900/50 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-transparent dark:from-emerald-950/40 border-b border-emerald-100/80 dark:border-emerald-950/50">
        <div className="flex items-center gap-2 text-base text-emerald-700 dark:text-emerald-400">
          <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <span className="font-semibold">处理完成</span>
        </div>
        <a
          href={downloadUrl(msg.jobId)}
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-500 hover:from-emerald-500 hover:to-emerald-600 text-white px-4 py-2 text-sm font-medium shadow-sm shadow-emerald-500/30 transition-all hover:scale-[1.02] active:scale-95"
        >
          <Download className="w-4 h-4" />
          下载 Excel
        </a>
      </div>
      {msg.sheets.length > 1 && (
        <div className="flex gap-1 px-5 pt-2 border-b border-emerald-100/80 dark:border-emerald-950/50 overflow-x-auto">
          {msg.sheets.map((s, i) => (
            <button
              key={s.name}
              onClick={() => setActiveSheet(i)}
              className={`px-3.5 py-2 text-sm rounded-t-lg whitespace-nowrap transition-colors ${
                i === activeSheet
                  ? "bg-white dark:bg-zinc-900 text-emerald-700 dark:text-emerald-300 border border-b-0 border-emerald-200 dark:border-emerald-900 font-medium"
                  : "text-zinc-500 hover:text-emerald-700 dark:hover:text-emerald-300"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      {sheet && (
        <>
          <div className="px-5 py-2 text-sm text-zinc-500 bg-zinc-50/60 dark:bg-zinc-800/30 border-b border-zinc-100 dark:border-zinc-800">
            共 <span className="font-medium text-zinc-700 dark:text-zinc-300">{sheet.row_count}</span> 行 · 预览前 {sheet.rows.length} 行
          </div>
          <div className="overflow-auto max-h-[28rem]">
            <table className="w-full text-sm">
              <thead className="bg-emerald-50/60 dark:bg-emerald-950/30 sticky top-0 backdrop-blur">
                <tr>
                  <th className="px-3 py-2.5 text-left text-zinc-500 font-medium border-b border-emerald-100 dark:border-emerald-900/50">#</th>
                  {sheet.columns.map((c) => (
                    <th key={c} className="px-4 py-2.5 text-left text-zinc-800 dark:text-zinc-200 font-semibold border-b border-emerald-100 dark:border-emerald-900/50 whitespace-nowrap">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheet.rows.map((row, i) => (
                  <tr key={i} className={`hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition-colors ${i % 2 === 0 ? "bg-white dark:bg-zinc-900" : "bg-zinc-50/60 dark:bg-zinc-800/30"}`}>
                    <td className="px-3 py-2 text-zinc-400 border-b border-zinc-100 dark:border-zinc-800">{i + 1}</td>
                    {sheet.columns.map((c) => (
                      <td key={c} className="px-4 py-2 text-zinc-800 dark:text-zinc-200 border-b border-zinc-100 dark:border-zinc-800 whitespace-nowrap">
                        {formatCell(row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {msg.stdout && (
        <details className="border-t border-emerald-100/80 dark:border-emerald-950/50">
          <summary className="px-5 py-2.5 text-sm text-zinc-500 cursor-pointer hover:text-emerald-700 dark:hover:text-emerald-300 select-none">
            查看执行日志
          </summary>
          <pre className="px-5 py-3 text-sm bg-zinc-50/60 dark:bg-zinc-800/30 text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap max-h-48 overflow-auto">
            {msg.stdout}
          </pre>
        </details>
      )}
    </div>
  );
}
