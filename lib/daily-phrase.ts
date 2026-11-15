import type { ReviewDraft } from "./types";

export type PhraseTheme = "general" | "exam" | "meeting" | "mistake";

/** 通用话术的最短有效长度；过短的条目不进入正文 */
export const MIN_DAILY_PHRASE_LENGTH = 20;
/** 与服务端 draft 字段上限保持一致 */
export const MAX_DAILY_PHRASE_LENGTH = 300;

// 从历史样例里提取并扩写的通用复盘话术。
// 每条不少于 20 个汉字，保持「服务理念 + 具体动作」的结构，
// 不包含学生姓名、金额和未确认的结果。
export const DAILY_PHRASES: Record<PhraseTheme, readonly string[]> = {
  general: [
    "坚持把日常服务做细，从排课、学情跟踪到课后反馈都跟到位，用稳定的服务质量赢得家长信任。",
    "服务细节还要再打磨，多关注孩子的上课状态和家长的实际需求，把跟进做在前面。",
    "做好学员全流程学情跟踪，及时更新缴费台账和课时记录，保证每一项数据真实准确。",
    "课后反馈和作业反馈尽量当天登记，完善每位学员的学情档案，做到每个孩子的情况都心里有数。",
    "持续优化服务细节，主动关注学员需求，把试卷打印、资料准备这些配套服务做在前面。",
    "严格遵守校区排课上课流程，所有课程安排都走学管，流程盯紧一点，避免出现信息遗漏。",
    "做好日常记录，及时同步学员情况，有问题第一时间沟通解决，不让小问题拖成大问题。",
    "学员服务再主动一些，提前想到家长和孩子接下来需要什么，通知提醒都做在前面。",
    "做好课时台账，及时响应家长和学生的问题，让家长感受到我们在持续用心跟进。",
    "把学员信息、学习情况同步到位，课后反馈和作业情况及时记录，做到每个孩子的情况都清楚。",
    "服务标准再提高一点，接待、沟通、反馈每个环节都按流程走，用细节积累口碑。",
    "每天把该跟进的事项列清楚，按优先级推进，做到事事有回应、件件有着落。",
    "和家长沟通时把话说清楚、说具体，既要反馈问题，也要给出下一步的配合建议。",
  ],
  exam: [
    "临近期中考试，后续重点抓牢背诵、默写这类基础得分点，持续查漏补缺，盯紧薄弱学生。",
    "考试这段时间重点盯紧孩子们的复习情况，及时做好学情预警，多和家长同步复习安排。",
    "考试后持续落实每位学生的学情分析，及时疏导考试心态，针对性布置复习任务。",
    "期中这段时间家长和孩子都比较看重成绩，服务上盯紧一点，通知尽量提前发、讲明白。",
    "复习阶段多关注每个孩子的专注度和作业完成情况，发现问题第一时间三方对接。",
    "考试前后做好复习资料准备和通知提醒，帮孩子稳住基础、调整状态，把学情跟踪做细。",
    "针对薄弱科目制定复习计划，每天跟进完成情况，及时把进步和问题反馈给家长。",
    "考前重点检查错题订正和知识点掌握情况，考后第一时间做好成绩分析和沟通。",
    "复习资料按学生分层准备，基础薄弱的多练基础题，冲刺的多做综合题，避免一刀切。",
    "考试期间多关注孩子的情绪状态，及时和家长沟通，帮孩子以平稳心态应考。",
    "期中复习阶段把每天的任务拆小，盯紧完成质量，避免临近考试才发现问题。",
    "考后及时整理每个孩子的失分点，形成下一阶段的跟进计划，让家长看到后续安排。",
  ],
  meeting: [
    "通过今天的部门会议和教研学习，进一步明确精细化服务的重要性，后续做好排课、学情跟进和课时统计。",
    "结合今天的会议内容，后续把学管流程再梳理一遍，重点盯紧排课、学情反馈和课时统计。",
    "今天的部门会议明确了近期工作重点，后续把会议精神落实到日常排课和学情跟进上。",
    "通过今天的会议复盘了近期服务问题，后续重点抓流程执行和家校沟通的及时性。",
    "教研讨论后对学情跟进有了更清晰的思路，后续把课堂反馈、作业情况和家长沟通串起来。",
    "会议结束后把近期重点工作重新排了优先级，排课、续费跟进、学情反馈都按节点推进。",
    "今天和任课老师一起梳理了重点学生的情况，后续按学科分工跟进，保证信息同步。",
    "通过教研学习了新的教学方法，后续会在学情分析和家长沟通中结合实际灵活运用。",
    "今天的会议重点强调了服务闭环，后续每条跟进都要有记录、有反馈、有结果。",
    "教研中梳理了近期学生的共性问题，后续会针对性地调整跟进重点和沟通方式。",
    "部门会议后明确了各环节的责任分工，后续遇到问题按流程对接，减少信息遗漏。",
    "把会议中提到的服务标准整理成清单，日常按清单逐项检查，保证执行不走样。",
  ],
  mistake: [
    "错题收集持续跟进，没交的家长后面再提醒，帮孩子们查漏补缺，把订正真正落到每个孩子身上。",
    "错题跟进不松懈，重点关注孩子的订正情况，发现问题及时和家长、任课老师沟通。",
    "错题收集和订正要继续盯紧，重点关注没交的家长，及时提醒并做好记录，避免积压。",
    "错题整理要形成闭环，录入、订正、讲解、反馈四步都跟进到位，让错题真正变成提分抓手。",
    "今天继续跟进错题录入和订正情况，后续重点检查孩子的订正质量，及时反馈给家长。",
    "错题收集再细致一些，按学生做好记录，没完成的及时提醒，帮孩子把薄弱点一个个补上。",
    "错题录入后要及时检查分类是否准确，方便后续按知识点给学生做针对性练习。",
    "重点关注错题重复出错的孩子，及时和任课老师沟通，调整讲解方式和练习强度。",
    "错题订正不能只看有没有写，还要检查孩子是否真正理解，必要时安排二次讲解。",
    "每周梳理一次错题收集情况，把未完成的学生名单整理出来，集中提醒跟进。",
    "错题反馈要具体到知识点，让家长知道孩子薄弱在哪里、下一步怎么配合。",
    "错题整理和期中复习结合起来，优先处理高频错题，帮孩子抓住主要失分点。",
  ],
};

const THEME_RULES: Array<{ theme: PhraseTheme; pattern: RegExp }> = [
  { theme: "exam", pattern: /期中|期末|考试|复习|提分|查漏补缺|成绩|背诵|默写/ },
  { theme: "meeting", pattern: /会议|开会|教研|部门|教讨会/ },
  { theme: "mistake", pattern: /错题/ },
];

/** 每天从 general 池取 3 条时使用的间隔，与池长 13 互质，保证当天不重复 */
const PHRASE_STEP = 5;

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
 * 按当天主题和日期抽取通用话术。
 * 同一天结果固定；命中主题时第一条来自主题池，其余从 general 池补足。
 */
export function pickDailyPhrases(
  dateISO: string,
  draft?: ReviewDraft,
  count = 3,
): string[] {
  const theme = draft ? detectPhraseTheme(draft) : "general";
  const day = Math.abs(dayNumber(dateISO));
  const picks: string[] = [];

  if (theme !== "general" && count > 0) {
    const pool = DAILY_PHRASES[theme];
    picks.push(pool[day % pool.length]);
  }

  const general = DAILY_PHRASES.general;
  const start = day % general.length;

  for (let i = 0; picks.length < count && i < general.length; i += 1) {
    const candidate =
      general[(start + i * PHRASE_STEP) % general.length];
    if (!picks.includes(candidate)) picks.push(candidate);
  }

  return picks.slice(0, count);
}

/** 兼容旧调用：只取 1 条 */
export function pickDailyPhrase(
  dateISO: string,
  draft?: ReviewDraft,
): string {
  return pickDailyPhrases(dateISO, draft, 1)[0] ?? "";
}
