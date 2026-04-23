import type { Message } from "./types";

export const WELCOME: Message = {
  id: "welcome",
  role: "assistant",
  kind: "text",
  text: "你好！我是 Excel 处理助手 👋\n上传一份或多份报表，告诉我你想怎么处理，我会给出方案，确认后立即执行并预览结果。",
};
