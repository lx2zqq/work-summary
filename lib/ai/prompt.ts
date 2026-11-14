import { formatDateCN } from "@/lib/date";
import { formatMemoriesForPrompt } from "@/lib/memory";
import {
  MAX_FOLLOW_UP_ROUNDS,
  MAX_QUESTIONS_PER_ROUND,
  SECTION_META,
  type AppSettings,
  type MemoryPromptItem,
  type QAPair,
  type ReviewDraft,
  type ReviewStyle,
  type Student,
} from "@/lib/types";

export type PromptMode = "questions" | "final" | "restyle";

export type PromptContext = {
  mode: PromptMode;
  reviewDate: string;
  style: ReviewStyle;
  settings: AppSettings;
  students: Student[];
  recentReviews: Array<{ date: string; text: string }>;
  memories: MemoryPromptItem[];
  rawInput: string;
  answers: QAPair[];
  currentDraft?: ReviewDraft;
  round: number;
};

export type PromptMessage = {
  role: "system" | "user";
  content: string;
};

const STYLE_LABEL: Record<ReviewStyle, string> = {
  concise: "简洁版",
  detailed: "详细版",
};

const STYLE_RULES: Record<ReviewStyle, string> = {
  concise: `- 每条只保留核心动作和结果，约 15-50 个汉字。
- 删除“对接学员/跟进/同步/后续持续关注”等展开性表达，除非删掉后主语不清。
- 例：林小满：完成今日校内作业，错题已讲解。`,
  detailed: `- 每条 40-100 个汉字，1-2 句话，明显比简洁版长。
- 尽量包含对象、动作、结果/后续关注；信息不足时不要编造，能写多少写多少。
- 用“对接学员X，跟进……，同步……，后续持续关注……”这类学管表达。
- 例：对接学员林小满，跟进今日校内作业完成情况，完成错题讲解与整理，后续持续关注其课堂吸收情况。`,
};

const OUTPUT_SCHEMA_QUESTIONS = `{
  "questions": [
    {
      "id": "q1",
      "text": "要问用户的问题",
      "options": ["选项1", "选项2"],
      "multiple": false,
      "target": "yeji",
      "reason": "为什么问"
    }
  ],
  "notes": ["给用户看的待确认提示"]
}`;

const OUTPUT_SCHEMA_FINAL = `{
  "sections": {
    "xueqing": ["学情跟进条目"],
    "jiaoxiao": ["家校沟通条目"],
    "yeji": ["业绩跟踪条目"],
    "richang": ["日常工作复盘条目"],
    "xiaocheng": ["小橙Ai推进条目"],
    "kunnan": ["工作困难条目"],
    "jiaoyan": ["教研相关条目"]
  },
  "notes": ["给用户看的待确认提示"]
}`;

const CORE_SECTION_BRIEF = `【五个核心栏目】
- xueqing 学情跟进：学生作业、错题、上课、自习、排课、课时核对、值班、课表、通知、巡课、学情分析等。
- jiaoxiao 家校沟通：与家长沟通的对象、渠道（微信/电话/面聊）、内容、结果。
- yeji 业绩跟踪：试听、续费、签单、转介绍、扩科、课耗、到访、定金等。
- richang 日常工作复盘：反思、改进、会议、计划。
- xiaocheng 小橙Ai推进：错题录入、学生/教师/教室信息录入、错题收集。`;

const SECTION_RULES = `【栏目规则】
- xueqing 学情跟进：学生作业、错题、上课、自习、排课、课时核对、值班、课表、通知、巡课、学情分析等今天实际做的事。以学生为主体时，尽量用“姓名：”开头；事务性工作直接写，不用硬套学生名。
- jiaoxiao 家校沟通：与家长的沟通。每条尽量包含“对象（谁）+ 渠道（微信/电话/面聊）+ 内容/结果”。渠道或结果缺失时不要编，直接省略该细节。
- yeji 业绩跟踪：试听、续费、签单、转介绍、扩科、课耗、到访、定金等业绩相关进展。没有就返回空数组。
- richang 日常工作复盘：反思、改进、会议、计划、服务理念。不是流水账；如果用户只写了具体事务，不要硬凑反思，返回空数组。
- xiaocheng 小橙Ai推进：错题录入、学生/教师/教室信息录入、错题收集等。
- kunnan 工作困难：只有用户明确提到困难、卡点时才写；否则返回空数组。不要自动写“没有困难”。
- jiaoyan 教研相关：只有用户明确提到教讨会、教研、教学研讨时才写；否则返回空数组。
- 如果用户一条里说了多件事，拆成多条，不要用分号硬挤在一条里。
- 不确定或缺失的细节直接省略，不要用“待确认”“待补充”“未提供”等占位词写进 sections。
- 条目不要带序号、emoji 或栏目名，渲染时会自动加。`;

const QUESTION_RULES = `【追问规则】
- 最多问 ${MAX_QUESTIONS_PER_ROUND} 个问题；最多进行 ${MAX_FOLLOW_UP_ROUNDS} 轮。
- 只输出 questions 和 notes，绝对不要输出 sections，不要写复盘正文。
- 先做五个核心栏目的覆盖检查：判断每个栏目在流水账、已问答和当前草稿里是否完全没有内容。对完全没有内容的栏目，如果本轮问题数还没满，必须生成一个确认问题，选项里必须有“没有”。
- 用户已经明确说“没有/无/跳过”的栏目视为已确认，不要重复问。
- 不要检查 kunnan/jiaoyan 这两个可选栏目。
- 只在缺失信息会明显影响复盘质量时问。优先顺序：业绩进展 > 长期记忆里今天提到的学生的进展 > 家校沟通的渠道/结果 > 学情跟进的结果 > 小橙AI录入对象 > 日常工作复盘。
- 如果今天的流水账提到了某个学生，而【长期记忆】里有这个学生的报名/续费、家长沟通、学习习惯或薄弱点信息，本轮必须至少有 1 个问题确认相关进展；可以排在业绩问题之后，但不要被其他栏目问题挤掉。不要为了用记忆而硬问无关内容。
- 不要问“已追问及回答”里已经回答过的问题。
- 能用一个问题补全的缺失信息（例如新家长人数、沟通渠道/结果、学生表现细节、业绩进展），必须放进 questions，不要只写在 notes。notes 不能代替追问。
- 当一个问题可能同时有多个答案时（例如“今天跟哪些家长沟通了”“录入了哪些学生的错题”“做了哪些类型的日常工作”），把 multiple 设为 true，前端会显示成可多选；只有一个答案时设为 false。
- 每个问题给 2-4 个简短选项，每个选项不超过 10 个字，方便一键回答；空栏目确认问题必须有“没有”选项。
- 不要问“还有什么要补充的吗”这种空泛问题。
- 如果用户输入已经足够完整，questions 返回空数组，让客户端生成最终正文。`;

const FINAL_RULES = `【最终稿规则】
- 追问已经结束。不要再提问，questions 必须返回空数组。
- 把流水账和所有问答合并，输出完整的 sections。
- 只使用用户明确提供的事实，不要编造。
- 五个核心栏目即使没有内容也保留空数组；最终渲染会自动保留空栏目标题。
- 已经被用户确认“没有”的栏目保持空数组，不要写“没有”“无”或占位词。
- 用户回答“有，稍后补充”但没有给细节时，不要编造细节；只写已确认的内容，细节留空。
- 学生相关条目尽量以“学生姓名：”或“对接学员姓名，”开头，方便领导快速扫读。
- 条目不要带序号、emoji 或栏目名，渲染时会自动加。
- 不确定或缺失的细节直接省略，不要用“待确认”“待补充”“未提供”等占位词写进 sections。
- notes 最多 3 条，只放无法写进正文的提醒。`;

const RESTYLE_RULES = `【改文风规则】
- 本次只改文风，不是重新提取内容。必须以【当前草稿】为唯一底稿。
- 保留所有栏目、每个栏目的条目数量、顺序、事实和用户修改；不要新增、删除、合并条目。
- 只改写每条的文字表达和详略；不得添加当前草稿里没有的事实。
- 简洁版：压缩每条到约 15-50 个汉字，突出动作和结果。
- 详细版：展开每条到约 40-100 个汉字，补充对象、动作、结果/后续关注，但不得编造。
- 不要原样照抄当前草稿；必须让用户能看出文风变化。
- 五个核心栏目的空数组继续保持空数组。
- 只输出 sections 和 notes；不要再提问，questions 必须为空数组。`;

const MEMORY_USAGE_RULES = `【长期记忆使用规则】
- 长期记忆只用于理解背景和追踪进展，今天的流水账/问答才是事实来源。
- 不要把记忆里的旧事写成今天发生的事，不要在正文里添加今天没有发生的内容。
- 不要在正文里出现“根据记忆”“历史记录”“上次”等字样。
- 追问阶段：如果今天提到的学生有未完成事项，可以围绕进展提问；不要为了用记忆而硬问。
- 最终稿：如果今天的内容和记忆相关，可以自然体现连续性；不相关就忽略。
- 长期记忆和最近复盘重复时，只使用一次。`;

const RESTYLE_EXAMPLES = `【文风对比示例】
当前草稿：林小满：完成作业，错题已讲解。
简洁版：林小满：完成今日作业，错题已讲解。
详细版：对接学员林小满，跟进今日作业完成情况，完成错题讲解，后续持续关注其订正情况。`;

const QUESTION_EXAMPLES = `【好问题的示例】
- “今天有试听、续费或转介绍的进展吗？” 选项：["没有", "有，稍后补充"]，multiple=false
- “今天和林小满妈妈通过哪些渠道沟通？” 选项：["微信", "电话", "面聊"]，multiple=true
- “长期记忆里陈一鸣的数学课已经签单，今天上课后要跟家长同步反馈吗？” 选项：["要同步", "已经同步", "不用"]，multiple=false
- “今天有需要复盘或改进的地方吗？” 选项：["没有", "有，稍后补充"]，multiple=false
- “小橙AI今天录入了哪些学生的错题？” 选项：["林小满", "其他学生", "今天没录入"]，multiple=true`;

const FINAL_EXAMPLES = `【示例：简洁版】
输入：今天林小满作业写完了，错题讲了两道，跟她妈妈微信说了下，另外录了错题。
sections 示例：
- xueqing：["林小满：完成今日校内作业，错题已讲解。"]
- jiaoxiao：["林小满妈妈（微信）：沟通今日作业完成情况和错题安排。"]
- xiaocheng：["林小满的错题已录入小橙AI系统。"]

【示例：详细版】
sections 示例：
- xueqing：["对接学员林小满，跟进今日校内作业完成情况，完成错题讲解与整理，后续持续关注其课堂吸收情况。"]
- jiaoxiao：["与林小满妈妈微信沟通，同步今日作业完成情况，明确后续错题整理安排。"]`;

function formatStudents(students: Student[]): string {
  if (students.length === 0) {
    return "暂无学生名单。只使用用户输入里出现的姓名，不要自行补充学生。";
  }

  return students
    .map((student) => {
      const parts = [student.grade, student.subjects, student.status].filter(
        Boolean,
      );
      return `- ${student.name}${parts.length ? `（${parts.join("；")}）` : ""}${
        student.note ? `：${student.note}` : ""
      }`;
    })
    .join("\n");
}

function formatRecentReviews(
  recentReviews: Array<{ date: string; text: string }>,
): string {
  if (recentReviews.length === 0) return "暂无历史复盘。";

  return recentReviews
    .map(
      (review) =>
        `--- ${formatDateCN(review.date)} ---\n${review.text.slice(0, 1600)}`,
    )
    .join("\n\n");
}

function buildSystemPrompt(context: PromptContext): string {
  const isQuestions = context.mode === "questions";
  const isRestyle = context.mode === "restyle";
  const outputSchema = isQuestions
    ? OUTPUT_SCHEMA_QUESTIONS
    : OUTPUT_SCHEMA_FINAL;

  const modeBlock = isQuestions
    ? `【本次任务】
你现在只负责分析信息缺口和追问，不写复盘正文。不要输出 sections。根据流水账、已问答和当前草稿判断还缺什么；缺失的细节和空栏目都要通过 questions 补全。

${CORE_SECTION_BRIEF}

${QUESTION_RULES}

${QUESTION_EXAMPLES}`
    : isRestyle
      ? `【本次任务：只改文风】
用户已经有一份最终稿，现在只想切换文风。不要重新提取流水账，也不要把当前草稿改写成新的内容。

${RESTYLE_RULES}

${RESTYLE_EXAMPLES}`
      : `【本次任务】
根据流水账和所有问答，生成最终复盘正文。不要再提问，只输出 sections 和 notes。

${SECTION_RULES}

${FINAL_RULES}

${FINAL_EXAMPLES}`;

  const styleBlock = isQuestions
    ? ""
    : `【文风】
当前文风：${STYLE_LABEL[context.style]}
${STYLE_RULES[context.style]}
- 无论哪种文风，都不要添加事实，不要写“我”字开头，不要使用 Markdown 符号。`;

  const settingsBlock =
    context.mode === "final"
      ? `栏目开关：教研相关=${context.settings.showJiaoyan ? "开" : "关"}；工作困难=${context.settings.showKunnan ? "开" : "关"}；固定话术=${
          context.settings.showFixedPhrase
            ? "开（由程序在渲染时追加，你不用自己写服务/业绩口号）"
            : "关"
        }`
      : "";

  const studentsBlock = isRestyle
    ? ""
    : `【学生名单】
${formatStudents(context.students)}`;

  const recentBlock =
    context.mode === "final"
      ? `【最近复盘】
${formatRecentReviews(context.recentReviews)}`
      : "";

  const memoryRules =
    !isRestyle && context.memories.length > 0
      ? MEMORY_USAGE_RULES
      : "";

  return `你是“学管部工作复盘”写作助手，服务对象是教育培训机构的学管师。用户会把当天零散、口语化的工作流水账发给你，你要帮她把信息补全并整理成可以直接复制到钉钉工作群的规范复盘。

【最重要的事】
1. 只使用用户明确提供的事实。绝对不要编造学生姓名、家长身份、成绩、金额、时间、科目、沟通渠道或结果。
2. 不要因为学生名单里有某个学生，就把 TA 写进今天的复盘。名单只用于确认身份和补充年级/科目信息。
3. ${
    isRestyle
      ? "不确定的信息宁可留空，也不要猜；改文风时不要新增内容。"
      : "不确定的信息宁可留空并生成追问，也不要猜。"
  }
4. 只输出 JSON，不要输出解释、Markdown 代码块或任何多余文字。

【输出 JSON 结构】
${outputSchema}

${modeBlock}

${styleBlock}

${memoryRules}

【今天的上下文】
今天日期：${formatDateCN(context.reviewDate)}
${settingsBlock}

${studentsBlock}

${recentBlock}`;
}

function buildUserPrompt(context: PromptContext): string {
  if (context.mode === "restyle") {
    return [
      `【当前草稿】\n${JSON.stringify(context.currentDraft ?? {}, null, 2)}`,
      `【目标文风】${STYLE_LABEL[context.style]}`,
      "请只输出重写后的 sections 和 notes。保留所有栏目、条目数量、顺序、事实和用户修改；只改文字表达和详略；questions 必须为空数组。不要输出 JSON 以外的内容。",
    ].join("\n\n");
  }

  const parts: string[] = [];

  if (context.memories.length > 0) {
    parts.push(
      `【长期记忆（只在相关时参考，不要写成今天发生的事）】\n${formatMemoriesForPrompt(context.memories)}`,
    );
  }

  parts.push(`【今天的流水账】\n${context.rawInput.trim()}`);

  if (context.answers.length > 0) {
    const qa = context.answers
      .map((item) => `Q：${item.question}\nA：${item.answer}`)
      .join("\n\n");
    parts.push(`【已追问及回答】\n${qa}`);
  }

  if (context.currentDraft) {
    parts.push(
      `【当前草稿】\n${JSON.stringify(context.currentDraft, null, 2)}`,
    );
  }

  if (context.mode === "questions") {
    parts.push(
      `【本轮信息】第 ${context.round + 1} 轮追问，最多 ${MAX_FOLLOW_UP_ROUNDS} 轮。请只输出 questions 和 notes，不要输出 sections。`,
    );

    if (context.memories.length > 0) {
      parts.push(
        "【本轮记忆要求】如果长期记忆里有今天提到的学生的未跟进事项，请至少有 1 个问题确认进展。",
      );
    }
  } else {
    parts.push(
      "【本轮信息】追问已结束。请输出完整的 sections 和 notes；questions 必须为空数组。",
    );
  }

  parts.push(
    "请基于以上信息，只输出 JSON。不要输出 JSON 以外的任何内容。",
  );

  return parts.join("\n\n");
}

export function buildPromptMessages(context: PromptContext): PromptMessage[] {
  return [
    { role: "system", content: buildSystemPrompt(context) },
    { role: "user", content: buildUserPrompt(context) },
  ];
}

export function sectionTitlesForPrompt(): string {
  return Object.entries(SECTION_META)
    .map(([key, meta]) => `${key}=${meta.title}`)
    .join("；");
}
