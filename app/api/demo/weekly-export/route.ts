import {
  firstIssue,
  jsonError,
  rateLimitExceeded,
  xlsxResponse,
} from "@/lib/api-helpers";
import { checkAiRateLimit } from "@/lib/rate-limit";
import { demoWeeklyExportRequestSchema } from "@/lib/schema";
import { buildWeeklyReportXlsx } from "@/lib/weekly-export";

export const maxDuration = 30;

/** 兼容 JSON 和原生表单：微信内用 form 提交触发下载，表单里放 JSON 字符串 */
async function readBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const form = await request.formData().catch(() => null);
    const payload = form?.get("payload");

    if (typeof payload !== "string" || !payload.trim()) return null;

    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }

  return request.json().catch(() => null);
}

/** 演示页免登录导出真实 xlsx；不读库、不调模型，只做模板填充 */
export async function POST(request: Request) {
  const limit = checkAiRateLimit(request, "demoWeeklyExport");
  if (!limit.allowed) return rateLimitExceeded(limit.retryAfter);

  const body = await readBody(request);
  const parsed = demoWeeklyExportRequestSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(firstIssue(parsed.error), 400);
  }

  try {
    const buffer = await buildWeeklyReportXlsx(parsed.data.content, {
      weekStart: parsed.data.weekStart,
      weekEnd: parsed.data.weekEnd,
    });

    return xlsxResponse(buffer, {
      weekStart: parsed.data.weekStart,
      weekEnd: parsed.data.weekEnd,
    });
  } catch (error) {
    console.error("[demo:weekly-export]", error);
    return jsonError("导出周报失败，请稍后重试", 500);
  }
}
