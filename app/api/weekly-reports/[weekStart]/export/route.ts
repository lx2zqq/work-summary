import {
  jsonError,
  requireApiSession,
  xlsxResponse,
} from "@/lib/api-helpers";
import { getWeekRange, isValidISODate } from "@/lib/date";
import { getWeeklyReport } from "@/lib/db/queries";
import { buildWeeklyReportXlsx } from "@/lib/weekly-export";

type RouteParams = {
  params: Promise<{ weekStart: string }>;
};

export const maxDuration = 30;

export async function GET(_request: Request, context: RouteParams) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const { weekStart: rawWeekStart } = await context.params;
  if (!isValidISODate(rawWeekStart)) {
    return jsonError("weekStart 参数不对", 400);
  }

  const week = getWeekRange(rawWeekStart);

  try {
    const report = await getWeeklyReport(week.weekStart);

    if (!report) {
      return jsonError("该周还没有周报，请先生成或保存", 404);
    }

    const buffer = await buildWeeklyReportXlsx(report.content, {
      weekStart: report.weekStart,
      weekEnd: report.weekEnd,
    });

    return xlsxResponse(buffer, {
      weekStart: report.weekStart,
      weekEnd: report.weekEnd,
    });
  } catch (error) {
    console.error("[weekly-reports:export]", error);
    return jsonError("导出周报失败，请稍后重试", 500);
  }
}
