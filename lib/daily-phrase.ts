import type { ReviewDraft } from "./types";

export type PhraseTheme = "general" | "exam" | "meeting" | "mistake";

// 从历史样例里整理的服务/复盘话术，去掉带具体学生姓名和具体任务的句子
export const DAILY_PHRASES: Record<PhraseTheme, readonly string[]> = {
  general: [
    "做更优质的服务，做更多的业绩。服务要更细致。",
    "学员服务再细致一点，多关注孩子上课情绪和做题状态，日常跟进不松懈。",
    "做好日常记录，及时同步学员情况，有问题第一时间沟通解决。",
    "坚持精细化服务标准，做好学员全流程学情跟踪，及时更新缴费台账和课时记录。",
    "及时登记课后反馈、作业反馈，完善每位学员的学情档案。",
    "持续优化服务细节，主动关注学员需求，做好资料准备等配套服务。",
    "做好课时台账，日常服务再细致一点，及时响应家长和学生的问题。",
    "严格遵守校区排课上课流程，所有课程安排都走学管，流程一定要盯紧。",
  ],
  exam: [
    "临近考试，重点抓牢背诵、默写这类基础得分点，持续查漏补缺。",
    "考试这段时间重点盯紧孩子们的复习情况，及时做好学情预警，多和家长同步情况。",
    "考试后持续落实每位学生的学情分析，及时疏导考试心态，针对性布置复习任务。",
    "考试这段时间家长和孩子都比较看重成绩，服务上盯紧一点，通知尽量提前发、讲明白。",
  ],
  meeting: [
    "通过今天的部门会议和教研学习，进一步明确精细化服务的重要性，后续做好排课对接、学情跟进、课时统计等基础工作。",
    "结合今天的会议内容，后续把学管流程再梳理一遍，重点盯紧排课、学情反馈和课时统计。",
    "今天的部门会议明确了近期工作重点，后续把会议精神落实到排课、学情跟进和课时统计上。",
    "通过今天的会议复盘了近期服务问题，后续重点抓流程执行和家校沟通的及时性。",
  ],
  mistake: [
    "错题收集持续跟进，没交的家长后面再提醒，帮孩子们查漏补缺。",
    "错题跟进不松懈，重点关注孩子的订正情况，发现问题及时和家长、任课老师沟通。",
    "错题收集和订正要继续盯紧，重点关注没交的家长，及时提醒并做好记录。",
    "错题整理要形成闭环，录入、订正、讲解、反馈四步都要跟进到位。",
  ],
};

const THEME_RULES: Array<{ theme: PhraseTheme; pattern: RegExp }> = [
  { theme: "exam", pattern: /期中|期末|考试|复习|提分|查漏补缺/ },
  { theme: "meeting", pattern: /会议|开会|教研|部门/ },
  { theme: "mistake", pattern: /错题/ },
];

export function detectPhraseTheme(draft: ReviewDraft): PhraseTheme {
  const corpus = Object.values(draft.sections ?? {}).flat().join(" ");

  for (const rule of THEME_RULES) {
    if (rule.pattern.test(corpus)) return rule.theme;
  }

  return "general";
}

function dayNumber(dateISO: string): number {
  const [year, month, day] = dateISO.split("-").map(Number);

  if (!year || !month || !day) return 0;

  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/**
 * 同一天固定，连续两天不同；按当天内容选择话术主题。
 */
export function pickDailyPhrase(
  dateISO: string,
  draft?: ReviewDraft,
): string {
  const theme = draft ? detectPhraseTheme(draft) : "general";
  const pool = DAILY_PHRASES[theme];
  const index = Math.abs(dayNumber(dateISO)) % pool.length;

  return pool[index];
}
