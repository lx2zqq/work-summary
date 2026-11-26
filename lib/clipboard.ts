"use client";

/** 优先用 Clipboard API，HTTP 或旧浏览器下退回 execCommand */
export async function copyText(text: string): Promise<boolean> {
  if (!text.trim()) return false;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 继续走兜底方案
  }

  let textarea: HTMLTextAreaElement | null = null;

  try {
    textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    // preventScroll 避免聚焦时页面跳到顶部
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    if (textarea?.parentNode) {
      textarea.parentNode.removeChild(textarea);
    }
  }
}
