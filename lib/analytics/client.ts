"use client";

// 客户端只上报白名单事件，字段与服务端 zod 校验保持一致。
// 不要在这里引入 events.ts，那个文件带 server-only。

export type ClientEvent = "review_copied" | "question_answered";

export type ClientEventProperties = {
  charCount?: number;
  itemCount?: number;
  round?: number;
  questionCount?: number;
  answeredCount?: number;
  usedOptionCount?: number;
  skipped?: boolean;
};

export function trackClientEvent(
  event: ClientEvent,
  reviewDate: string,
  properties: ClientEventProperties = {},
): void {
  if (typeof window === "undefined") return;

  void fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, reviewDate, properties }),
    keepalive: true,
  }).catch(() => {
    // 埋点失败不影响用户操作
  });
}
