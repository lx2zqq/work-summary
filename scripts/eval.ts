import "./load-env";

import assert from "node:assert/strict";
import { generateDraft } from "@/lib/ai/deepseek";
import type { PromptContext } from "@/lib/ai/prompt";
import { normalizeDraft } from "@/lib/draft";
import { renderReview } from "@/lib/template";
import {
  MAX_FOLLOW_UP_ROUNDS,
  emptyDraft,
  type AppSettings,
  type QAPair,
  type ReviewDraft,
} from "@/lib/types";

const SETTINGS: AppSettings = {
  defaultStyle: "concise",
  showJiaoyan: true,
  showKunnan: false,
  showFixedPhrase: false,
};

function testTemplate() {
  const draft: ReviewDraft = {
    ...emptyDraft(),
    sections: {
      ...emptyDraft().sections,
      xueqing: ["林小满：完成今日校内作业，错题已讲解。"],
      jiaoxiao: ["林小满妈妈（微信）：沟通今日作业完成情况。"],
      richang: ["服务再细致一些。"],
      xiaocheng: ["林小满的数学错题已录入小橙AI系统。"],
      jiaoyan: ["参加学管部教研。"],
    },
  };

  const text = renderReview(draft, "2026-11-13", SETTINGS);
  assert.ok(text.startsWith("学管部工作复盘⬇️"), "标题应固定");
  assert.ok(text.includes("2026年11月13日工作复盘"), "日期应正确");
  assert.ok(text.includes("🍊【学情跟进】"), "应包含学情跟进");
  assert.ok(text.includes("🍊【业绩跟踪】"), "空栏目也应保留");
  assert.ok(!text.includes("🍊【工作困难】"), "工作困难默认关闭");
  assert.ok(text.includes("🍊【教研相关】"), "教研相关默认开启且有内容");

  const withKunnan = renderReview(draft, "2026-11-13", {
    ...SETTINGS,
    showKunnan: true,
    showFixedPhrase: true,
  });
  assert.ok(withKunnan.includes("🍊【工作困难】"), "开启后应显示工作困难");
  assert.ok(
    withKunnan.includes("目前没有困难，有困难都已经想办法解决。"),
    "无困难时应写标准句",
  );
  assert.ok(
    withKunnan.includes("做更优质的服务，做更多的业绩。服务要更细致。"),
    "开启固定话术后应自动补",
  );

  const normalized = normalizeDraft({
    sections: {
      xueqing: ["1️⃣ 林小满：完成作业。", "林小满：完成作业。"],
      jiaoxiao: [],
      yeji: [],
      richang: [],
      xiaocheng: ["林小满：完成作业。"],
      kunnan: [],
      jiaoyan: [],
    },
    questions: [
      { text: "问题1", options: ["没有", "有"] },
      { text: "问题2", options: ["微信", "电话"] },
      { text: "问题3", options: [] },
      { text: "问题4", options: [] },
    ],
  });
  assert.equal(normalized.sections.xueqing.length, 1, "重复条目应去重");
  assert.equal(normalized.questions.length, 3, "追问最多 3 条");

  console.log("✓ 模板与草稿结构测试通过");
}

const CASES = [
  {
    name: "短流水账",
    style: "concise" as const,
    rawInput:
      "今天林小满作业写完了，错题讲了两道，跟她妈妈微信说了下，另外把小橙AI的错题录了。",
  },
  {
    name: "中等流水账",
    style: "detailed" as const,
    rawInput:
      "今天林小满的校内作业完成了，数学错题讲了三道；她妈妈微信说这周想加一节英语课；下午跟一个新家长电话约了周六试听；另外开了学管部教研会，讨论期中复习。",
  },
  {
    name: "长流水账",
    style: "concise" as const,
    rawInput:
      "今天上午前台值班，核对课时，更新课表。林小满妈妈面聊，说孩子最近作业慢，我跟老师对接了。下午给林小满录了数学错题，还录了一个新学生周子航的信息。晚上跟家长群发通知。",
  },
];

function buildContext(
  rawInput: string,
  style: "concise" | "detailed",
): PromptContext {
  return {
    mode: "final",
    reviewDate: "2026-11-13",
    style,
    settings: SETTINGS,
    students: [
      {
        id: "student-1",
        name: "林小满",
        grade: "初一",
        subjects: "数学、英语",
        status: "在读",
        note: null,
      },
    ],
    recentReviews: [],
    rawInput,
    answers: [],
    currentDraft: undefined,
    round: 0,
  };
}

async function testFollowUpFlow() {
  console.log("\n===== 追问 → 最终稿检查 =====");

  const rawInput =
    "今天接待了几位新家长，沟通了林小满的课堂表现，另外处理了日常排课。";
  let current: ReviewDraft | null = null;
  let answers: QAPair[] = [];
  let askedRounds = 0;

  for (let round = 0; round < MAX_FOLLOW_UP_ROUNDS; round += 1) {
    const draft = await generateDraft({
      ...buildContext(rawInput, "concise"),
      mode: "questions",
      round,
      answers,
      currentDraft: current
        ? { ...current, questions: [] }
        : undefined,
    });

    console.log(`第 ${round + 1} 轮追问：`, draft.questions);
    assert.ok(
      draft.questions.length <= 3,
      "每轮追问不能超过 3 条",
    );
    assert.ok(
      draft.questions.every(
        (question) => typeof question.multiple === "boolean",
      ),
      "追问应带 multiple 标记",
    );

    if (draft.questions.length === 0) break;

    askedRounds += 1;
    current = draft;
    answers = [
      ...answers,
      ...draft.questions.map((question) => ({
        question: question.text,
        answer: "没有补充",
      })),
    ];
  }

  assert.ok(askedRounds > 0, "至少应有一轮追问");

  const finalDraft = await generateDraft({
    ...buildContext(rawInput, "concise"),
    mode: "final",
    round: MAX_FOLLOW_UP_ROUNDS,
    answers,
    currentDraft: current
      ? { ...current, questions: [] }
      : undefined,
  });

  console.log(
    "最终稿：\n",
    renderReview(finalDraft, "2026-11-13", SETTINGS),
  );
  assert.equal(finalDraft.questions.length, 0, "最终稿不应再追问");
  assert.ok(
    finalDraft.sections.xueqing.length > 0,
    "最终稿学情跟进不应为空",
  );
  console.log("✓ 追问与最终稿检查通过");
}

async function testRestyle() {
  console.log("\n===== 改文风检查 =====");

  const rawInput =
    "今天林小满作业写完了，错题讲了两道，跟她妈妈微信说了下，另外把小橙AI的错题录了。";
  const base = buildContext(rawInput, "concise");

  const concise = await generateDraft({
    ...base,
    mode: "final",
    round: MAX_FOLLOW_UP_ROUNDS,
  });

  const detailed = await generateDraft({
    ...base,
    mode: "restyle",
    style: "detailed",
    round: MAX_FOLLOW_UP_ROUNDS,
    currentDraft: concise,
  });

  const backToConcise = await generateDraft({
    ...base,
    mode: "restyle",
    style: "concise",
    round: MAX_FOLLOW_UP_ROUNDS,
    currentDraft: detailed,
  });

  const countItems = (draft: ReviewDraft) =>
    Object.values(draft.sections).reduce(
      (sum, items) => sum + items.length,
      0,
    );
  const countChars = (draft: ReviewDraft) =>
    Object.values(draft.sections).flat().join("").length;

  console.log("简洁版：\n", renderReview(concise, "2026-11-13", SETTINGS));
  console.log("详细版：\n", renderReview(detailed, "2026-11-13", SETTINGS));
  console.log(
    "再切回简洁：\n",
    renderReview(backToConcise, "2026-11-13", SETTINGS),
  );
  console.log(
    `条目数：${countItems(concise)} → ${countItems(detailed)} → ${countItems(
      backToConcise,
    )}`,
  );
  console.log(
    `字数：${countChars(concise)} → ${countChars(detailed)} → ${countChars(
      backToConcise,
    )}`,
  );

  assert.equal(
    countItems(detailed),
    countItems(concise),
    "切详细版不能增删条目",
  );
  assert.equal(
    countItems(backToConcise),
    countItems(concise),
    "切回简洁版不能增删条目",
  );
  assert.ok(
    countChars(detailed) > countChars(concise),
    "详细版字数应增加",
  );
  assert.ok(
    countChars(backToConcise) <= countChars(detailed),
    "切回简洁版字数应减少",
  );
  console.log("✓ 改文风检查通过");
}

async function main() {
  testTemplate();

  if (!process.env.REVIEW_DEEPSEEK_API_KEY?.trim()) {
    console.log(
      "! 未配置 REVIEW_DEEPSEEK_API_KEY，跳过真实 AI 测试。配置后可运行 npm run eval。",
    );
    return;
  }

  for (const item of CASES) {
    console.log(`\n===== ${item.name}（${item.style}）=====`);
    const draft = await generateDraft({
      ...buildContext(item.rawInput, item.style),
      mode: "final",
    });
    const text = renderReview(draft, "2026-11-13", SETTINGS);

    console.log(text);
    console.log("\n最终稿 notes：", draft.notes);

    assert.ok(draft.sections.xueqing.length > 0, "学情跟进不应为空");
    assert.equal(draft.questions.length, 0, "最终稿不应再追问");
    assert.ok(!text.includes("尚云天"), "不能编造输入里没有的学生");
  }

  await testFollowUpFlow();
  await testRestyle();

  console.log("\n✓ 真实 AI 测试通过");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
