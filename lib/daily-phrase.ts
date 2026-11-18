import type { CustomPhrase, PhraseTheme, ReviewDraft } from "./types";

export type { PhraseTheme };

/** 通用话术的最短有效长度；过短的条目不进入正文（兼容旧数据，不要调高） */
export const MIN_DAILY_PHRASE_LENGTH = 20;
/** 与服务端 draft 字段上限保持一致 */
export const MAX_DAILY_PHRASE_LENGTH = 300;
/** 扩写后的目标长度区间，只用于测试断言 */
export const TARGET_PHRASE_MIN_LENGTH = 45;
export const TARGET_PHRASE_MAX_LENGTH = 60;

// 从历史样例里提取并扩写的通用复盘话术。
// 每条落在 45~60 字，结构是「具体动作 + 可验证结果」，
// 不写形容词堆砌，也不包含学生姓名、金额和未确认的结果。
export const DAILY_PHRASES: Record<PhraseTheme, readonly string[]> = {
  general: [
    "坚持把日常服务做细，排课、学情跟踪、课后反馈每个环节都跟到位；家长的问题当天响应，结果及时同步，用稳定服务积累信任。",
    "服务细节还要再打磨，课前确认孩子的到课和作业情况，课后主动问一句课堂感受，把家长关心的问题想在前面、答在当场。",
    "做好学员全流程学情跟踪，缴费台账和课时记录按天更新，每周核对一次剩余课时，保证每一项数据都能对得上。",
    "课后反馈和作业反馈尽量当天登记，把课堂表现、作业完成和错题情况写进学情档案，做到每个孩子的情况都能说清楚。",
    "持续优化服务细节，试卷打印、资料准备、教室布置这些配套工作提前一天落实，让孩子到校区就能直接进入状态。",
    "严格遵守校区排课上课流程，所有课程调整都走学管登记，改动后第一时间同步家长和任课老师，避免出现信息遗漏。",
    "做好日常记录，每天下班前把学员情况同步到工作群，发现问题当天就沟通，不让一个小问题拖成家长的心结。",
    "学员服务再主动一些，提前想到家长和孩子接下来需要什么，课程调整、考试安排这些通知提前发出去，留足准备时间。",
    "做好课时台账，家长和学生的问题尽量当天答复，答复不了的先约定一个回复时间，让家长感受到我们一直在跟进。",
    "把学员信息、学习情况同步到位，新报名的当天建档，在读的每周更新一次，课后反馈和作业情况及时记录，不让信息滞后。",
    "服务标准再提高一点，接待、沟通、反馈每个环节都按流程走，沟通完留下记录，反馈后跟进结果，用细节积累口碑。",
    "每天把该跟进的事项列清楚，按紧急程度和影响面排好优先级，当天能办完的不拖到第二天，做到事事有回应、件件有着落。",
    "和家长沟通时把话说清楚、说具体，既要反馈问题和当前状态，也要给出下一步怎么配合的建议，避免家长听完不知道做什么。",
  ],
  exam: [
    "临近期中考试，后续重点抓牢背诵、默写这类基础得分点，每天抽时间检查一遍，持续查漏补缺，把薄弱学生单独列出来盯。",
    "考试这段时间重点盯紧孩子们的复习情况，发现进度落后的及时做学情预警，把复习安排多和家长同步几次，让家里也能配合上。",
    "考试后持续落实每位学生的学情分析，把失分点分类整理出来，及时疏导考试心态，再针对薄弱环节布置下一阶段的复习任务。",
    "期中这段时间家长和孩子都比较看重成绩，服务上盯紧一点，考试通知、成绩查询这些安排尽量提前发，把时间和注意事项讲清楚。",
    "复习阶段多关注每个孩子的专注度和作业完成情况，发现问题第一时间和家长、任课老师三方对接，当天定好调整方案。",
    "考试前后做好复习资料准备和通知提醒，资料按科目和难度分好类，帮孩子稳住基础、调整状态，把学情跟踪做细。",
    "针对薄弱科目制定复习计划，把每天的任务拆到能完成的程度，跟进完成情况，及时把进步和问题反馈给家长。",
    "考前重点检查错题订正和知识点掌握情况，考后第一时间做好成绩分析，把下一阶段的学习安排和家长沟通到位。",
    "复习资料按学生分层准备，基础薄弱的多练基础题、把课本例题吃透，冲刺的多做综合题，避免一套资料所有人用。",
    "考试期间多关注孩子的情绪状态，发现紧张焦虑的及时和家长沟通，一起把节奏放慢一点，帮孩子以平稳心态应考。",
    "期中复习阶段把每天的任务拆小，盯紧完成质量，当天的任务当天检查，避免临近考试才发现问题堆在一起。",
    "考后及时整理每个孩子的失分点，按知识点归类，形成下一阶段的跟进计划，和家长当面沟通一次，让家长看到后续安排。",
  ],
  meeting: [
    "通过今天的部门会议和教研学习，进一步明确了精细化服务的标准，后续把排课、学情跟进和课时统计按新要求落实到位。",
    "结合今天的会议内容，后续把学管流程再梳理一遍，排课、学情反馈和课时统计这三个环节逐项对照，把不顺畅的地方改掉。",
    "今天的部门会议明确了近期工作重点，后续把会议要求落实到每天的排课和学情跟进上，每周对照一次完成情况。",
    "通过今天的会议复盘了近期服务上出现的问题，后续重点抓流程执行和家校沟通的及时性，发现拖延的当天补齐。",
    "教研讨论后对学情跟进有了更清晰的思路，后续把课堂反馈、作业情况和家长沟通串成一条线，避免各环节各说各的。",
    "会议结束后把近期重点工作重新排了优先级，排课、续费跟进、学情反馈都按节点推进，临期的提前一天确认。",
    "今天和任课老师一起梳理了重点学生的情况，后续按学科分工跟进，每周碰一次进展，保证学管和老师的信息同步。",
    "通过教研学习了新的教学方法，后续会在学情分析和家长沟通中结合实际灵活运用，先试一段时间看效果再调整。",
    "今天的会议重点强调了服务闭环，后续每条跟进都要有记录、有反馈、有结果，没闭环的事项单独列出来跟踪。",
    "教研中梳理了近期学生的共性问题，后续会针对性地调整跟进重点和沟通方式，把共性问题整理成清单复用到日常。",
    "部门会议后明确了各环节的责任分工，后续遇到问题按流程直接找对应的人，减少来回问和中间的信息遗漏。",
    "把会议中提到的服务标准整理成一份清单，日常按清单逐项检查，每周统计一次执行情况，保证要求落地不走样。",
  ],
  mistake: [
    "错题收集持续推进，没交的家长单独提醒，交了但没订正的重点盯，帮孩子们查漏补缺，把订正真正落到每个孩子身上。",
    "错题跟进不松懈，重点关注孩子的订正情况，发现同类题反复出错的及时和家长、任课老师沟通，调整练习方向。",
    "错题收集和订正要继续盯紧，重点关注没交的家长，提醒之后做好记录，连续两次没交的换个方式再沟通，避免积压。",
    "错题整理要形成闭环，录入、订正、讲解、反馈四步都跟进到位，每一步都留下记录，让错题真正变成提分的抓手。",
    "今天继续跟进错题录入和订正情况，后续重点检查孩子的订正质量，看是否真的理解，检查结果及时反馈给家长。",
    "错题收集再细致一些，按学生和知识点做好记录，没完成的及时提醒，帮孩子把薄弱点一个一个补上，不让问题越积越多。",
    "错题录入后要及时检查分类是否准确，按知识点和题型归好类，方便后续给学生做针对性练习，也便于看共性问题。",
    "重点关注错题重复出错的孩子，及时和任课老师沟通，一起分析是理解问题还是练习不够，再调整讲解方式和练习强度。",
    "错题订正不能只看有没有写，还要让孩子讲一遍思路，确认是否真正理解，没弄明白的安排二次讲解或同类题巩固。",
    "每周梳理一次错题收集情况，把未完成的学生名单整理出来，按家长沟通习惯集中提醒，下一周再核对一次进度。",
    "错题反馈要具体到知识点，说清楚孩子薄弱在哪个模块、最近练了哪些题，让家长知道下一步该怎么配合。",
    "错题整理和期中复习结合起来，优先处理高频错题和反复出错的知识点，帮孩子抓住主要失分点，把时间花在能提分的地方。",
  ],
};

const THEME_RULES: Array<{ theme: PhraseTheme; pattern: RegExp }> = [
  { theme: "exam", pattern: /期中|期末|考试|复习|提分|查漏补缺|成绩|背诵|默写/ },
  {
    theme: "meeting",
    pattern: /会议|开会|开完会|开了个会|开了会|例会|教研|部门|教讨会/,
  },
  { theme: "mistake", pattern: /错题/ },
];

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * 步长必须和池长互质，才能保证一天内不重复。
 * 加入自定义话术后池长会变，不能再写死 5。
 */
function pickStep(length: number): number {
  if (length <= 1) return 1;

  return (
    [5, 7, 11, 13, 17, 19].find(
      (step) => step < length && gcd(step, length) === 1,
    ) ?? 1
  );
}

function phrasePool(
  theme: PhraseTheme,
  customPhrases: CustomPhrase[],
): string[] {
  return [
    ...DAILY_PHRASES[theme],
    ...customPhrases
      .filter((phrase) => phrase.theme === theme && phrase.content.trim())
      .map((phrase) => phrase.content.trim()),
  ];
}

/** 按关键词判断一段文字的主题，插话润色和草稿检测共用 */
export function detectThemeFromText(text: string): PhraseTheme {
  for (const rule of THEME_RULES) {
    if (rule.pattern.test(text)) return rule.theme;
  }

  return "general";
}

export function detectPhraseTheme(draft: ReviewDraft): PhraseTheme {
  const corpus = Object.values(draft.sections ?? {}).flat().join(" ");
  return detectThemeFromText(corpus);
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
  customPhrases: CustomPhrase[] = [],
): string[] {
  const theme = draft ? detectPhraseTheme(draft) : "general";
  const day = Math.abs(dayNumber(dateISO));
  const picks: string[] = [];

  if (theme !== "general" && count > 0) {
    const pool = phrasePool(theme, customPhrases);
    picks.push(pool[day % pool.length]);
  }

  const general = phrasePool("general", customPhrases);
  const start = day % general.length;
  const step = pickStep(general.length);

  for (let i = 0; picks.length < count && i < general.length; i += 1) {
    const candidate = general[(start + i * step) % general.length];
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
