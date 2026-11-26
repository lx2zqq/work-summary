/** 控制字符会被浏览器截断或重新解析地址，一律拒绝 */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
/** 协议头，如 https:、javascript:、data: */
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * 登录后跳转路径的白名单校验，防止开放重定向。
 * 只放行站内绝对路径：必须以单个 "/" 开头，
 * 拒绝 "//host"、"/\host"、"https://host" 和控制字符。
 */
export function sanitizeNextPath(next: string | null | undefined): string {
  if (!next) return "/";
  if (CONTROL_CHARS.test(next)) return "/";

  const value = next.trim();
  if (!value || !value.startsWith("/")) return "/";
  // "//" 和 "/\" 都会被浏览器当成协议相对地址
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (value.includes("\\")) return "/";
  if (SCHEME.test(value)) return "/";

  return value;
}
