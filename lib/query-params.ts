/**
 * 解析正整数查询参数。
 * 返回 null 表示参数非法：空串、0、负数、小数、非数字都算。
 * 超过 max 时按 max 处理。
 */
export function parsePositiveInt(
  value: string | null,
  options: { fallback: number; max: number },
): number | null {
  if (value === null) return options.fallback;
  if (!/^\d+$/.test(value)) return null;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return null;

  return Math.min(parsed, options.max);
}
