export const uid = () => Math.random().toString(36).slice(2, 10);

export function statusLabel(s: string): string {
  switch (s) {
    case "pending_confirm": return "待确认";
    case "executing": return "执行中";
    case "done": return "已完成";
    case "failed": return "失败";
    default: return s;
  }
}

export function formatTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

export function formatCell(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return String(v);
    return String(Number(v.toFixed(4)));
  }
  return String(v);
}
