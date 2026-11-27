import { formatDateCN } from "./date";
import type {
  Student,
  WeeklyReportContent,
  WeeklyReportMeta,
} from "./types";

const EMPTY_LIST = "无";
const EMPTY_TEXT = "暂无";
const UNKNOWN_GRADE = "未填年级";

/** 常见年级的固定顺序，未知年级排在最后 */
const GRADE_ORDER = new Map(
  [
    "一年级",
    "二年级",
    "三年级",
    "四年级",
    "五年级",
    "六年级",
    "初一",
    "初二",
    "初三",
    "高一",
    "高二",
    "高三",
  ].map((grade, index) => [grade, index]),
);

/** 在读学员按年级统计人数，供“在读学员年级及人数”直接使用 */
export function summarizeActiveStudentsByGrade(
  students: Pick<Student, "status" | "grade">[],
): string {
  const counts = new Map<string, number>();
  let total = 0;

  for (const student of students) {
    if (student.status !== "在读") continue;

    const grade = student.grade?.trim() || UNKNOWN_GRADE;
    counts.set(grade, (counts.get(grade) ?? 0) + 1);
    total += 1;
  }

  if (total === 0) return "暂无在读学员";

  const lines = [...counts.entries()]
    .sort(([a], [b]) => {
      if (a === UNKNOWN_GRADE) return 1;
      if (b === UNKNOWN_GRADE) return -1;

      const rankA = GRADE_ORDER.get(a) ?? Number.MAX_SAFE_INTEGER;
      const rankB = GRADE_ORDER.get(b) ?? Number.MAX_SAFE_INTEGER;
      return rankA === rankB ? a.localeCompare(b, "zh-CN") : rankA - rankB;
    })
    .map(([grade, count]) => `${grade}：${count}人`);

  lines.push(`合计：${total}人`);
  return lines.join("\n");
}

/** 新建周报时的空白结构；名单类默认“无”，支持默认“暂无” */
export function createEmptyWeeklyReportContent(
  activeStudentsByGrade: string = EMPTY_TEXT,
): WeeklyReportContent {
  return {
    summary: {
      miantan: "",
      weixin: "",
    },
    metrics: {
      qingjia: EMPTY_LIST,
      yujing: EMPTY_LIST,
      tingke: EMPTY_LIST,
      jieke: EMPTY_LIST,
      kuoke: EMPTY_LIST,
      xinqian: EMPTY_LIST,
      xufei: EMPTY_LIST,
      activeStudentsByGrade: activeStudentsByGrade.trim() || EMPTY_TEXT,
    },
    reflection: "",
    nextWeek: {
      zhongdianHuifang: EMPTY_LIST,
      jiazhanghui: EMPTY_LIST,
    },
    supportNeeded: EMPTY_TEXT,
  };
}

function orDefault(value: string, fallback: string): string {
  return value.trim() || fallback;
}

/** 转成适合直接发微信/钉钉群的纯文本 */
export function formatWeeklyReportPlainText(
  content: WeeklyReportContent,
  meta: WeeklyReportMeta,
): string {
  const range = `${formatDateCN(meta.weekStart)} 至 ${formatDateCN(meta.weekEnd)}`;

  return [
    `本周工作周报（${range}）`,
    "",
    "【本周工作总结】",
    `面谈：${orDefault(content.summary.miantan, EMPTY_LIST)}`,
    `微信：${orDefault(content.summary.weixin, EMPTY_LIST)}`,
    "",
    "【本周数据汇总】",
    `请假：${orDefault(content.metrics.qingjia, EMPTY_LIST)}`,
    `预警名单：${orDefault(content.metrics.yujing, EMPTY_LIST)}`,
    `停课名单：${orDefault(content.metrics.tingke, EMPTY_LIST)}`,
    `结课名单：${orDefault(content.metrics.jieke, EMPTY_LIST)}`,
    `扩科：${orDefault(content.metrics.kuoke, EMPTY_LIST)}`,
    `新签：${orDefault(content.metrics.xinqian, EMPTY_LIST)}`,
    `续费：${orDefault(content.metrics.xufei, EMPTY_LIST)}`,
    "在读学员年级及人数：",
    orDefault(content.metrics.activeStudentsByGrade, EMPTY_TEXT),
    "",
    "【本周工作心得】",
    orDefault(content.reflection, EMPTY_TEXT),
    "",
    "【下周工作安排】",
    `重点回访：${orDefault(content.nextWeek.zhongdianHuifang, EMPTY_LIST)}`,
    `家长会：${orDefault(content.nextWeek.jiazhanghui, EMPTY_LIST)}`,
    "",
    "【需要的支持】",
    orDefault(content.supportNeeded, EMPTY_TEXT),
  ].join("\n");
}
