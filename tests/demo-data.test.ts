import { describe, expect, it } from "vitest";
import {
  buildDemoMemoryList,
  buildDemoReviews,
  buildDemoWeeklyGeneratedContent,
  buildDemoWeeklyReports,
  buildDemoWeeklyReviewDates,
  demoWeeklyActiveGrades,
  DEMO_DRAFT_CONCISE,
  DEMO_DRAFT_DETAILED,
  DEMO_MEMORIES,
  DEMO_QUESTIONS,
  DEMO_RAW_INPUT,
  DEMO_SETTINGS,
  DEMO_STUDENTS,
} from "@/lib/demo-data";
import { addDaysISO, getWeekRange, shiftWeek } from "@/lib/date";
import { renderReview } from "@/lib/template";
import type { SectionKey } from "@/lib/types";

const CORE_SECTIONS: SectionKey[] = [
  "xueqing",
  "jiaoxiao",
  "yeji",
  "richang",
  "xiaocheng",
];

function sectionLines(text: string, title: string): string[] {
  const match = text.match(
    new RegExp(`🍊【${title}】([\\s\\S]*?)(?:\\n🍊【|$)`),
  );

  return (match?.[1] ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

describe("演示数据", () => {
  it("流水账和学生名单不为空", () => {
    expect(DEMO_RAW_INPUT.length).toBeGreaterThan(30);
    expect(DEMO_STUDENTS).toHaveLength(2);
    expect(DEMO_STUDENTS.every((student) => student.name.length > 0)).toBe(
      true,
    );
  });

  it("五个核心栏目都有内容", () => {
    for (const key of CORE_SECTIONS) {
      expect(DEMO_DRAFT_CONCISE.sections[key].length).toBeGreaterThan(0);
      expect(DEMO_DRAFT_DETAILED.sections[key].length).toBeGreaterThan(0);
    }
  });

  it("日常工作复盘恰好 1 条，且和通用话术长度接近", () => {
    expect(DEMO_DRAFT_CONCISE.sections.richang).toHaveLength(1);
    expect(DEMO_DRAFT_CONCISE.sections.richang[0]?.length).toBeGreaterThanOrEqual(
      40,
    );
  });

  it("演示 richang 使用温和优化口吻，不是工作小结", () => {
    for (const draft of [DEMO_DRAFT_CONCISE, DEMO_DRAFT_DETAILED]) {
      const item = draft.sections.richang[0] ?? "";

      expect(item.length).toBeGreaterThanOrEqual(25);
      expect(item.length).toBeLessThanOrEqual(100);
      expect(item).not.toContain("整体推进正常");
      expect(item).not.toContain("后续继续盯");
    }
  });

  it("追问问题都有 id、选项和合法栏目", () => {
    expect(DEMO_QUESTIONS).toHaveLength(3);

    for (const question of DEMO_QUESTIONS) {
      expect(question.id.length).toBeGreaterThan(0);
      expect(question.text.length).toBeGreaterThan(0);
      expect(question.options.length).toBeGreaterThanOrEqual(2);
      expect(question.options.length).toBeLessThanOrEqual(4);
    }
  });

  it("详细版总字数明显多于简洁版", () => {
    const count = (draft: typeof DEMO_DRAFT_CONCISE) =>
      Object.values(draft.sections)
        .flat()
        .reduce((total, item) => total + item.length, 0);

    expect(count(DEMO_DRAFT_DETAILED)).toBeGreaterThan(
      count(DEMO_DRAFT_CONCISE) * 1.5,
    );
  });

  it("记忆至少有两条，且都关联学生", () => {
    expect(DEMO_MEMORIES.length).toBeGreaterThanOrEqual(2);
    expect(DEMO_MEMORIES.every((memory) => memory.studentName)).toBe(true);
  });

  it("渲染后保留五个核心栏目，日常复盘补足 4 条", () => {
    const text = renderReview(
      DEMO_DRAFT_CONCISE,
      "2026-11-18",
      DEMO_SETTINGS,
    );

    expect(text).toContain("2026年11月18日工作复盘");
    expect(sectionLines(text, "学情跟进").length).toBeGreaterThan(0);
    expect(sectionLines(text, "家校沟通").length).toBeGreaterThan(0);
    expect(sectionLines(text, "业绩跟踪").length).toBeGreaterThan(0);
    expect(sectionLines(text, "小橙Ai推进").length).toBeGreaterThan(0);

    // 1 条 AI 复盘 + 3 条通用话术
    expect(sectionLines(text, "日常工作复盘")).toHaveLength(4);
  });

  it("历史列表三条，日期从昨天往前排，有一条待补全", () => {
    const today = "2026-11-18";
    const reviews = buildDemoReviews(today);

    expect(reviews).toHaveLength(3);
    expect(reviews.map((item) => item.reviewDate)).toEqual([
      addDaysISO(today, -1),
      addDaysISO(today, -2),
      addDaysISO(today, -3),
    ]);
    expect(reviews.filter((item) => item.questions > 0)).toHaveLength(1);
    expect(reviews.filter((item) => item.finalText.trim())).toHaveLength(2);
  });

  it("记忆列表包含学生、通用、阶段性和已归档记忆", () => {
    const memories = buildDemoMemoryList("2026-11-18");

    expect(memories).toHaveLength(5);
    expect(memories.some((item) => item.scope === "general")).toBe(true);
    expect(memories.filter((item) => item.scope === "student")).toHaveLength(
      3,
    );
    expect(
      memories.filter(
        (item) => item.status === "active" && item.lifecycle === "ephemeral",
      ),
    ).toHaveLength(1);
    expect(
      memories.filter((item) => item.status === "archived"),
    ).toHaveLength(1);
    expect(memories.every((item) => item.id.startsWith("demo-"))).toBe(true);
  });

  it("演示数据不包含真实学生信息之外的字段", () => {
    for (const student of DEMO_STUDENTS) {
      expect(student.id.startsWith("demo-")).toBe(true);
    }
    for (const memory of DEMO_MEMORIES) {
      expect(memory.id.startsWith("demo-")).toBe(true);
    }
  });

  it("演示周报包含上一周定稿和本周草稿", () => {
    const today = "2026-11-18";
    const current = getWeekRange(today);
    const last = shiftWeek(current.weekStart, -1);
    const reports = buildDemoWeeklyReports(today);

    expect(reports).toHaveLength(2);

    const lastReport = reports.find(
      (item) => item.weekStart === last.weekStart,
    );
    const currentReport = reports.find(
      (item) => item.weekStart === current.weekStart,
    );

    expect(lastReport?.status).toBe("finalized");
    expect(currentReport?.status).toBe("draft");
    expect(currentReport?.generatedAt).toBeNull();
  });

  it("演示周报的年级人数与演示学员一致", () => {
    const active = demoWeeklyActiveGrades();
    const reports = buildDemoWeeklyReports("2026-11-18");

    expect(active).toContain("初三：1人");
    expect(active).toContain("高一：1人");
    expect(active).toContain("合计：2人");
    expect(
      reports.every(
        (item) =>
          item.content.metrics.activeStudentsByGrade === active,
      ),
    ).toBe(true);
  });

  it("演示周报关联日期覆盖上一周和本周到今天", () => {
    const today = "2026-11-18";
    const current = getWeekRange(today);
    const last = shiftWeek(current.weekStart, -1);
    const dates = buildDemoWeeklyReviewDates(today);

    expect(dates).toContain(last.weekStart);
    expect(dates).toContain(current.weekStart);
    expect(dates).toContain(today);
    expect(dates).not.toContain(addDaysISO(today, 1));
    expect([...dates].sort()).toEqual(dates);
  });

  it("模拟 AI 结果呼应演示学员和本周事项", () => {
    const content = buildDemoWeeklyGeneratedContent();

    expect(content.summary.miantan).toContain("林小满");
    expect(content.summary.weixin).toContain("陈一鸣妈妈");
    expect(content.metrics.xufei).toContain("林小满");
    expect(content.metrics.activeStudentsByGrade).toBe(
      demoWeeklyActiveGrades(),
    );
    expect(content.reflection).toContain("排课调整");
  });
});
