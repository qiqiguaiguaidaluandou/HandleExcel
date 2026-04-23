"use client";

import { useEffect, useRef } from "react";
import { Loader2, Sparkles } from "lucide-react";

import type { Message } from "@/utils/types";
import { MessageBubble } from "./MessageBubble";

export function MessageList({
  messages,
  sending,
  onExecute,
}: {
  messages: Message[];
  sending: boolean;
  onExecute: (id: string, jobId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {messages.map((m) => (
          <MessageBubble key={m.id} msg={m} onExecute={onExecute} />
        ))}
        {sending && (
          <div className="flex gap-3 items-center text-base text-zinc-500 animate-pulse">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-emerald-200 to-emerald-400 shadow-sm flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="flex items-center gap-2 bg-white/70 dark:bg-zinc-900/70 backdrop-blur border border-emerald-100 dark:border-emerald-900/50 rounded-2xl px-4 py-2.5 shadow-sm">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
              <span>AI 思考中…</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
