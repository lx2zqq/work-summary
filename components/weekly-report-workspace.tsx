"use client";

import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Info,
  RefreshCw,
  Save,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateText } from "@/components/ui/date-text";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { copyText } from "@/lib/clipboard";
import {
  addDaysISO,
  formatDateShort,
  getDefaultWeeklyReportRange,
  getWeekRange,
  isValidISODate,
  shiftWeek,
  todayISO,
  weekdayCN,
} from "@/lib/date";
import {
  buildDemoWeeklyGeneratedContent,
  buildDemoWeeklyReports,
  buildDemoWeeklyReviewDates,
  DEMO_STUDENTS,
  DEMO_THINKING_MS,
} from "@/lib/demo-data";
import type {
  Student,
  WeeklyReport,
  WeeklyReportContent,
  WeeklyReportStatus,
} from "@/lib/types";
import {
  createEmptyWeeklyReportContent,
  formatWeeklyReportPlainText,
  summarizeActiveStudentsByGrade,
} from "@/lib/weekly-report";
import { cn } from "@/lib/utils";

type Mode = "live" | "demo";

type Props = {
  mode: Mode;
  /** 服务端传入今天，避免服务端与浏览器时区不同导致水合不一致 */
  today?: string;
  /** demo 模式使用演示 Provider 里的学员 */
  demoStudents?: Student[];
  /** demo 模式可纳入汇总的日报日期 */
  demoReviewDates?: string[];
};

type WeeklyLoadResult = {
  weekStart: string;
  weekEnd: string;
  isMondayDefaultLastWeek: boolean;
  report: WeeklyReport | null;
  sourceReviews: string[];
  computedActiveStudentsByGrade: string;
};

type SaveOptions = {
  silent?: boolean;
};

/** 和空白模板逐字段比较，避免把默认的“无/暂无”误判成用户已填写 */
function isPristineWeeklyContent(
  content: WeeklyReportContent,
  activeStudentsByGrade: string,
): boolean {
  const empty = createEmptyWeeklyReportContent(activeStudentsByGrade);

  return (
    content.summary.miantan === empty.summary.miantan &&
    content.summary.weixin === empty.summary.weixin &&
    (
      Object.keys(empty.metrics) as Array<
        keyof WeeklyReportContent["metrics"]
      >
    ).every((key) => content.metrics[key] === empty.metrics[key]) &&
    content.reflection === empty.reflection &&
    content.nextWeek.zhongdianHuifang ===
      empty.nextWeek.zhongdianHuifang &&
    content.nextWeek.jiazhanghui === empty.nextWeek.jiazhanghui &&
    content.supportNeeded === empty.supportNeeded
  );
}

function upsertDemoReport(
  reports: WeeklyReport[],
  next: WeeklyReport,
): WeeklyReport[] {
  const exists = reports.some((item) => item.weekStart === next.weekStart);

  return exists
    ? reports.map((item) => (item.weekStart === next.weekStart ? next : item))
    : [...reports, next];
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 周报工作台，live 和 demo 共用。
 * live 走正式 API；demo 只使用 lib/demo-data 里的内存数据。
 */
export function WeeklyReportWorkspace({
  mode,
  today = todayISO(),
  demoStudents,
  demoReviewDates,
}: Props) {
  const isDemo = mode === "demo";
  const baseToday = isValidISODate(today) ? today : todayISO();
  const currentWeek = useMemo(() => getWeekRange(baseToday), [baseToday]);
  const initialDefault = useMemo(
    () =>
      getDefaultWeeklyReportRange(
        new Date(`${baseToday}T12:00:00+08:00`),
      ),
    [baseToday],
  );
  const students = demoStudents ?? DEMO_STUDENTS;
  const reviewDates = useMemo(
    () => demoReviewDates ?? buildDemoWeeklyReviewDates(baseToday),
    [demoReviewDates, baseToday],
  );
  const initialDemoReports = useMemo(
    () => (isDemo ? buildDemoWeeklyReports(baseToday) : []),
    [isDemo, baseToday],
  );

  const [weekStart, setWeekStart] = useState(initialDefault.weekStart);
  const [sourceStartDate, setSourceStartDate] = useState(
    initialDefault.weekStart,
  );
  const [sourceEndDate, setSourceEndDate] = useState(
    initialDefault.weekEnd,
  );
  const [content, setContent] = useState<WeeklyReportContent>(() =>
    createEmptyWeeklyReportContent(),
  );
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [status, setStatus] = useState<WeeklyReportStatus>("draft");
  const [sourceReviews, setSourceReviews] = useState<string[]>([]);
  const [computedActiveStudentsByGrade, setComputedActiveStudentsByGrade] =
    useState("暂无");
  const [loading, setLoading] = useState(true);
  const [refreshingSource, setRefreshingSource] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [manualEdited, setManualEdited] = useState(false);
  const [sourceExpanded, setSourceExpanded] = useState(false);
  const [customRangeOpen, setCustomRangeOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showMondayHint, setShowMondayHint] = useState(
    initialDefault.isMondayDefaultLastWeek,
  );
  const [sourceError, setSourceError] = useState("");
  const [loadError, setLoadError] = useState("");

  const mountedRef = useRef(true);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const generatingRef = useRef(false);
  const exportingRef = useRef(false);
  const loadedWeekRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);
  const demoReportsRef = useRef<WeeklyReport[]>(initialDemoReports);

  const weekEnd = useMemo(
    () => getWeekRange(weekStart).weekEnd,
    [weekStart],
  );
  const hasContent = !isPristineWeeklyContent(
    content,
    computedActiveStudentsByGrade,
  );
  // 已保存周报是否非空；重新打开页面后也要拦住误覆盖
  const hasSavedReport = Boolean(
    report &&
      !isPristineWeeklyContent(
        report.content,
        computedActiveStudentsByGrade,
      ),
  );
  const busy = loading || refreshingSource || saving || isGenerating;
  const editorDisabled = loading || isGenerating;
  const isCustomSourceRange =
    sourceStartDate !== weekStart || sourceEndDate !== weekEnd;

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 有未保存修改时，刷新/关闭页面前让浏览器弹出确认
  useEffect(() => {
    if (!dirty) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  function markDirty() {
    dirtyRef.current = true;
    setDirty(true);
    setManualEdited(true);
  }

  function clearDirty() {
    dirtyRef.current = false;
    setDirty(false);
  }

  function updateSummary(field: "miantan" | "weixin", value: string) {
    setContent((current) => ({
      ...current,
      summary: { ...current.summary, [field]: value },
    }));
    markDirty();
  }

  function updateMetric(
    field: keyof WeeklyReportContent["metrics"],
    value: string,
  ) {
    setContent((current) => ({
      ...current,
      metrics: { ...current.metrics, [field]: value },
    }));
    markDirty();
  }

  function updateNextWeek(
    field: "zhongdianHuifang" | "jiazhanghui",
    value: string,
  ) {
    setContent((current) => ({
      ...current,
      nextWeek: { ...current.nextWeek, [field]: value },
    }));
    markDirty();
  }

  function updateReflection(value: string) {
    setContent((current) => ({ ...current, reflection: value }));
    markDirty();
  }

  function updateSupport(value: string) {
    setContent((current) => ({ ...current, supportNeeded: value }));
    markDirty();
  }

  async function loadWeek(
    targetWeekStart: string,
    sourceStart: string,
    sourceEnd: string,
    options: { full: boolean; signal?: AbortSignal },
  ) {
    const targetWeek = getWeekRange(targetWeekStart);
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const stop = () => {
      if (options.full) setLoading(false);
      else setRefreshingSource(false);
    };

    if (!isValidISODate(sourceStart) || !isValidISODate(sourceEnd)) {
      setSourceError("汇总日期格式不对");
      stop();
      return;
    }
    if (sourceStart > sourceEnd) {
      setSourceError("开始日期不能晚于结束日期");
      stop();
      return;
    }
    if (sourceEnd > addDaysISO(sourceStart, 13)) {
      setSourceError("汇总区间不能超过 14 天");
      stop();
      return;
    }

    setSourceError("");
    setLoadError("");
    if (options.full) setLoading(true);
    else setRefreshingSource(true);

    try {
      let data: WeeklyLoadResult;

      if (isDemo) {
        const demoReport =
          demoReportsRef.current.find(
            (item) => item.weekStart === targetWeek.weekStart,
          ) ?? null;
        const dates = reviewDates
          .filter((date) => date >= sourceStart && date <= sourceEnd)
          .sort();

        data = {
          weekStart: targetWeek.weekStart,
          weekEnd: targetWeek.weekEnd,
          isMondayDefaultLastWeek: false,
          report: demoReport,
          sourceReviews: dates,
          computedActiveStudentsByGrade:
            summarizeActiveStudentsByGrade(students),
        };
      } else {
        const params = new URLSearchParams({
          weekStart: targetWeek.weekStart,
          sourceStartDate: sourceStart,
          sourceEndDate: sourceEnd,
        });
        const response = await fetch(
          `/api/weekly-reports?${params.toString()}`,
          { signal: options.signal },
        );
        const payload = (await response.json().catch(() => ({}))) as
          | (WeeklyLoadResult & { error?: string })
          | { error?: string };

        if (!response.ok) {
          throw new Error(
            ("error" in payload && payload.error) || "加载周报失败",
          );
        }

        data = payload as WeeklyLoadResult;
      }

      if (
        requestId !== requestIdRef.current ||
        options.signal?.aborted ||
        !mountedRef.current
      ) {
        return;
      }

      setSourceReviews(data.sourceReviews);
      setComputedActiveStudentsByGrade(
        data.computedActiveStudentsByGrade,
      );

      if (!options.full) return;

      const nextContent =
        data.report?.content ??
        createEmptyWeeklyReportContent(
          data.computedActiveStudentsByGrade,
        );

      setReport(data.report);
      setStatus(data.report?.status ?? "draft");
      setContent(nextContent);
      clearDirty();
      setManualEdited(
        Boolean(
          data.report &&
            (data.report.status === "finalized" ||
              !data.report.generatedAt),
        ),
      );
      loadedWeekRef.current = targetWeek.weekStart;
    } catch (error) {
      if (options.signal?.aborted) return;
      if (!mountedRef.current) return;
      setLoadError(
        error instanceof Error ? error.message : "加载周报失败",
      );
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        if (options.full) setLoading(false);
        else setRefreshingSource(false);
      }
    }
  }

  // 用 ref 指向最新的 loadWeek，避免 effect 依赖函数本身导致重复请求
  const loadWeekRef = useRef(loadWeek);
  useEffect(() => {
    loadWeekRef.current = loadWeek;
  });

  useEffect(() => {
    const controller = new AbortController();
    const weekChanged = loadedWeekRef.current !== weekStart;
    // 只改汇总日期时，如果还有未保存修改，就只刷新来源篇数，不覆盖正文
    const full = weekChanged || !dirtyRef.current;

    void loadWeekRef.current(weekStart, sourceStartDate, sourceEndDate, {
      full,
      signal: controller.signal,
    });

    return () => controller.abort();
  }, [weekStart, sourceStartDate, sourceEndDate]);

  async function saveReport(options: SaveOptions = {}): Promise<boolean> {
    if (savingRef.current) return false;

    savingRef.current = true;
    setSaving(true);

    try {
      let nextReport: WeeklyReport;

      if (isDemo) {
        const stamp = new Date().toISOString();
        nextReport = {
          id: report?.id ?? `demo-weekly-${weekStart}`,
          weekStart,
          weekEnd,
          content,
          status,
          sourceReviewCount: sourceReviews.length,
          generatedAt: report?.generatedAt ?? null,
          createdAt: report?.createdAt ?? stamp,
          updatedAt: stamp,
        };
        demoReportsRef.current = upsertDemoReport(
          demoReportsRef.current,
          nextReport,
        );
      } else {
        const response = await fetch(`/api/weekly-reports/${weekStart}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, status }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          report?: WeeklyReport;
        };

        if (!response.ok || !payload.report) {
          throw new Error(payload.error || "保存周报失败");
        }

        nextReport = payload.report;
      }

      if (!mountedRef.current) return true;

      setReport(nextReport);
      setContent(nextReport.content);
      setStatus(nextReport.status);
      clearDirty();
      if (!options.silent) toast.success("周报已保存");
      return true;
    } catch (error) {
      if (mountedRef.current) {
        toast.error(
          error instanceof Error ? error.message : "保存周报失败",
        );
      }
      return false;
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  }

  async function handleWeekChange(nextWeekStart: string) {
    if (busy) return;

    const target = getWeekRange(nextWeekStart);
    if (target.weekStart === weekStart) return;

    if (dirtyRef.current) {
      const saved = await saveReport({ silent: true });
      if (!saved) return;
    }

    setShowMondayHint(false);
    setCustomRangeOpen(false);
    setWeekStart(target.weekStart);
    setSourceStartDate(target.weekStart);
    setSourceEndDate(target.weekEnd);
  }

  async function runGenerate() {
    if (generatingRef.current) return;

    generatingRef.current = true;
    setConfirmOpen(false);
    setIsGenerating(true);
    setLoadError("");

    try {
      let nextReport: WeeklyReport;

      if (isDemo) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, DEMO_THINKING_MS),
        );
        const stamp = new Date().toISOString();
        const generated = buildDemoWeeklyGeneratedContent(
          computedActiveStudentsByGrade,
        );
        nextReport = {
          id: report?.id ?? `demo-weekly-${weekStart}`,
          weekStart,
          weekEnd,
          content: generated,
          status: "draft",
          sourceReviewCount: sourceReviews.length,
          generatedAt: stamp,
          createdAt: report?.createdAt ?? stamp,
          updatedAt: stamp,
        };
        demoReportsRef.current = upsertDemoReport(
          demoReportsRef.current,
          nextReport,
        );
      } else {
        const body: {
          weekStart: string;
          sourceStartDate?: string;
          sourceEndDate?: string;
        } = { weekStart };

        if (isCustomSourceRange) {
          body.sourceStartDate = sourceStartDate;
          body.sourceEndDate = sourceEndDate;
        }

        const response = await fetch("/api/weekly-reports/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          report?: WeeklyReport;
        };

        if (!response.ok || !payload.report) {
          throw new Error(payload.error || "生成周报失败");
        }

        nextReport = payload.report;
      }

      if (!mountedRef.current) return;

      setReport(nextReport);
      setContent(nextReport.content);
      setStatus(nextReport.status);
      clearDirty();
      setManualEdited(false);
      toast.success(
        isDemo ? "演示周报已生成" : "周报已生成并保存",
      );
    } catch (error) {
      if (mountedRef.current) {
        toast.error(
          error instanceof Error ? error.message : "生成周报失败",
        );
      }
    } finally {
      generatingRef.current = false;
      if (mountedRef.current) setIsGenerating(false);
    }
  }

  function requestGenerate() {
    if (generatingRef.current || loading || refreshingSource || saving) {
      return;
    }
    if (sourceError) {
      toast.error(sourceError);
      return;
    }
    if (sourceReviews.length === 0) {
      toast.info("该日期范围内暂无日报，可先手动填写");
      return;
    }
    // 已保存的非空周报、本次会话的编辑或未保存修改都要先确认
    if (hasSavedReport || manualEdited || dirty) {
      setConfirmOpen(true);
      return;
    }

    void runGenerate();
  }

  async function handleExport() {
    if (exportingRef.current || isGenerating || saving) return;

    exportingRef.current = true;
    setIsExporting(true);

    try {
      if (!report && !hasContent) {
        toast.error("还没有可导出的内容");
        return;
      }

      // 导出前先保存当前修改，保证下载的是最新版本（demo 保存到内存）
      if (dirtyRef.current) {
        const saved = await saveReport({ silent: true });
        if (!saved) return;
      }

      if (isDemo) {
        const response = await fetch("/api/demo/weekly-export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weekStart, weekEnd, content }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(payload.error || "导出失败");
        }

        const blob = await response.blob();
        downloadBlob(blob, `周报_${weekStart}_${weekEnd}.xlsx`);
      } else {
        const response = await fetch(
          `/api/weekly-reports/${weekStart}/export`,
        );

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(payload.error || "导出失败");
        }

        const blob = await response.blob();
        downloadBlob(blob, `周报_${weekStart}_${weekEnd}.xlsx`);
      }

      toast.success("Excel 已导出");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导出失败");
    } finally {
      exportingRef.current = false;
      if (mountedRef.current) setIsExporting(false);
    }
  }

  async function handleCopy() {
    const text = formatWeeklyReportPlainText(content, {
      weekStart,
      weekEnd,
    });
    const okay = await copyText(text);

    if (okay) toast.success("纯文本已复制");
    else toast.error("复制失败，请手动选择文本");
  }

  function handleSyncGrades() {
    const next = computedActiveStudentsByGrade.trim() || "暂无";

    if (content.metrics.activeStudentsByGrade === next) {
      toast.info("年级人数已是最新");
      return;
    }

    updateMetric("activeStudentsByGrade", next);
    toast.success("已从学员库同步人数");
  }

  function handleResetSourceRange() {
    setSourceStartDate(weekStart);
    setSourceEndDate(weekEnd);
  }

  function retryLoad() {
    void loadWeekRef.current(
      weekStart,
      sourceStartDate,
      sourceEndDate,
      // 有未保存修改时只刷新来源，避免把正文冲掉
      { full: !dirtyRef.current },
    );
  }

  const statusInfo = useMemo(() => {
    if (!report && !hasContent) {
      return { text: "未生成", tone: "stone" as const };
    }
    if (dirty) {
      return { text: "有改动", tone: "amber" as const };
    }

    return { text: "已保存", tone: "green" as const };
  }, [report, hasContent, dirty]);

  return (
    <>
      <div className="space-y-4">
        <section className="paper-card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-3 py-3 sm:px-4">
            <div className="flex flex-wrap items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  void handleWeekChange(
                    shiftWeek(weekStart, -1).weekStart,
                  );
                }}
              >
                <ChevronLeft className="h-4 w-4" />
                上一周
              </Button>
              <Button
                variant={
                  weekStart === currentWeek.weekStart
                    ? "secondary"
                    : "ghost"
                }
                size="sm"
                disabled={busy || weekStart === currentWeek.weekStart}
                onClick={() => {
                  void handleWeekChange(currentWeek.weekStart);
                }}
              >
                本周
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  void handleWeekChange(shiftWeek(weekStart, 1).weekStart);
                }}
              >
                下一周
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="relative rounded-lg px-2 py-1.5 transition-colors hover:bg-cream-deep/60">
              <input
                type="date"
                value={weekStart}
                disabled={busy}
                aria-label="选择周报日期"
                onChange={(event) => {
                  const value = event.target.value;
                  if (value) {
                    void handleWeekChange(getWeekRange(value).weekStart);
                  }
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              />
              <span className="pointer-events-none flex items-baseline gap-1.5 text-sm text-ink">
                <DateText
                  iso={weekStart}
                  numeralClassName="font-serif text-[1.1em] font-normal tracking-[-0.01em]"
                />
                <span className="text-ink-soft">~</span>
                <DateText
                  iso={weekEnd}
                  numeralClassName="font-serif text-[1.1em] font-normal tracking-[-0.01em]"
                />
              </span>
            </div>

            <Badge tone={statusInfo.tone}>{statusInfo.text}</Badge>

            {loading ? (
              <span className="flex items-center gap-1 text-[11px] text-ink-soft">
                <Spinner className="h-3 w-3" />
                读取中
              </span>
            ) : null}

            <button
              type="button"
              onClick={() => setSourceExpanded((value) => !value)}
              aria-expanded={sourceExpanded}
              className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-soft transition-colors hover:text-ink"
            >
              <FileText className="h-3.5 w-3.5" />
              已关联 {sourceReviews.length} 篇日报
              {sourceExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          {showMondayHint ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-butter/50 bg-butter-soft px-3 py-2 text-xs leading-relaxed text-warning-deep sm:px-4">
              <span>今天是周一，已默认定位上一周方便写周报。</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void handleWeekChange(currentWeek.weekStart);
                }}
                className="shrink-0 font-medium underline underline-offset-2 disabled:opacity-50"
              >
                切到本周
              </button>
            </div>
          ) : null}

          {sourceReviews.length === 0 ? (
            <div className="flex items-start gap-2 border-t border-line/60 bg-cream/60 px-3 py-2 text-xs leading-relaxed text-ink-soft sm:px-4">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand/70" />
              <span>这一周还没有日报，AI 生成暂不可用。</span>
            </div>
          ) : null}

          {sourceExpanded ? (
            <div className="border-t border-line/60 bg-cream/40 px-3 py-2.5 sm:px-4">
              {sourceReviews.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {sourceReviews.map((date) => (
                    <span
                      key={date}
                      className="inline-flex items-baseline gap-1 rounded-md bg-paper px-2 py-1 text-[11px] text-ink-soft ring-1 ring-line/70"
                    >
                      <span className="font-medium text-ink">
                        {formatDateShort(date)}
                      </span>
                      <span>{weekdayCN(date)}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ink-soft">
                  暂无纳入汇总的日报。
                </p>
              )}
            </div>
          ) : null}
        </section>

        {loadError ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-xs text-danger">
            <span>{loadError}</span>
            <Button variant="ghost" size="sm" onClick={retryLoad}>
              重试
            </Button>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <section className="paper-card overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-line/70 px-4 py-3 sm:px-5">
              <h2 className="text-sm font-semibold tracking-tight text-ink">
                周报内容
              </h2>
              {refreshingSource ? (
                <span className="flex items-center gap-1 text-[11px] text-ink-soft">
                  <Spinner className="h-3 w-3" />
                  刷新日报
                </span>
              ) : null}
            </div>

            <div className="divide-y divide-line/70">
              <EditorSection index="01" title="本周工作总结">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="面谈" htmlFor="weekly-miantan">
                  <Textarea
                    id="weekly-miantan"
                    value={content.summary.miantan}
                    disabled={editorDisabled}
                    onChange={(event) =>
                      updateSummary("miantan", event.target.value)
                    }
                    rows={4}
                    placeholder="按学员或事项分条，例如：林小满：沟通续费，家长确认周六到店。"
                  />
                </Field>
                <Field label="微信" htmlFor="weekly-weixin">
                  <Textarea
                    id="weekly-weixin"
                    value={content.summary.weixin}
                    disabled={editorDisabled}
                    onChange={(event) =>
                      updateSummary("weixin", event.target.value)
                    }
                    rows={4}
                    placeholder="按学员或事项分条，例如：林小满妈妈：微信同步作业完成情况。"
                  />
                </Field>
              </div>
            </EditorSection>

            <EditorSection index="02" title="本周数据汇总">
              <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:grid-cols-3">
                {[
                  ["qingjia", "请假"],
                  ["yujing", "预警名单"],
                  ["tingke", "停课名单"],
                  ["jieke", "结课名单"],
                  ["kuoke", "扩科"],
                  ["xinqian", "新签"],
                  ["xufei", "续费"],
                ].map(([field, label]) => (
                  <MetricField
                    key={field}
                    label={label}
                    value={
                      content.metrics[
                        field as keyof WeeklyReportContent["metrics"]
                      ]
                    }
                    disabled={editorDisabled}
                    onChange={(value) =>
                      updateMetric(
                        field as keyof WeeklyReportContent["metrics"],
                        value,
                      )
                    }
                  />
                ))}
              </div>

              <div className="mt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label
                    htmlFor="weekly-active-grades"
                    className="text-xs font-medium text-ink-soft"
                  >
                    在读学员年级及人数
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={editorDisabled}
                    onClick={handleSyncGrades}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    从学员库同步人数
                  </Button>
                </div>
                <Textarea
                  id="weekly-active-grades"
                  value={content.metrics.activeStudentsByGrade}
                  disabled={editorDisabled}
                  onChange={(event) =>
                    updateMetric(
                      "activeStudentsByGrade",
                      event.target.value,
                    )
                  }
                  rows={4}
                  placeholder={"高一：3人\n高二：2人\n合计：5人"}
                  className="mt-1.5"
                />
              </div>
            </EditorSection>

            <EditorSection index="03" title="本周工作心得">
              <Textarea
                id="weekly-reflection"
                aria-label="本周工作心得"
                value={content.reflection}
                disabled={editorDisabled}
                onChange={(event) =>
                  updateReflection(event.target.value)
                }
                rows={5}
                placeholder="写 2~4 条有具体落脚点的心得，例如：续费沟通要先确认家长到店时间……"
              />
            </EditorSection>

            <EditorSection index="04" title="下周工作安排">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="重点回访"
                  htmlFor="weekly-zhongdian-huifang"
                >
                  <Textarea
                    id="weekly-zhongdian-huifang"
                    value={content.nextWeek.zhongdianHuifang}
                    disabled={editorDisabled}
                    onChange={(event) =>
                      updateNextWeek(
                        "zhongdianHuifang",
                        event.target.value,
                      )
                    }
                    rows={4}
                    placeholder="学员 + 事由，例如：陈一鸣：确认周六补课到课情况。"
                  />
                </Field>
                <Field label="家长会" htmlFor="weekly-jiazhanghui">
                  <Textarea
                    id="weekly-jiazhanghui"
                    value={content.nextWeek.jiazhanghui}
                    disabled={editorDisabled}
                    onChange={(event) =>
                      updateNextWeek("jiazhanghui", event.target.value)
                    }
                    rows={4}
                    placeholder="没有就填无。"
                  />
                </Field>
              </div>
            </EditorSection>

            <EditorSection index="05" title="需要的支持">
              <Textarea
                id="weekly-support"
                aria-label="需要的支持"
                value={content.supportNeeded}
                disabled={editorDisabled}
                onChange={(event) =>
                  updateSupport(event.target.value)
                }
                rows={3}
                placeholder="没有就填暂无。"
              />
            </EditorSection>
            </div>
          </section>

          <aside className="order-first space-y-3 lg:order-last lg:sticky lg:top-20">
            <div className="paper-card space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold tracking-tight text-ink">
                  周报操作
                </h2>
                <Badge tone={statusInfo.tone}>{statusInfo.text}</Badge>
              </div>

              <div className="space-y-1.5">
                <Button
                  className="w-full"
                  loading={isGenerating}
                  disabled={
                    loading ||
                    refreshingSource ||
                    saving ||
                    Boolean(sourceError) ||
                    !sourceReviews.length
                  }
                  title={
                    sourceReviews.length === 0
                      ? "该日期范围内暂无日报"
                      : undefined
                  }
                  onClick={requestGenerate}
                >
                  <Sparkles className="h-4 w-4" />
                  {report || hasContent ? "重新生成周报" : "AI 生成周报"}
                </Button>
                {isGenerating || sourceError ? (
                  <p
                    className={cn(
                      "text-center text-[11px] leading-relaxed",
                      sourceError ? "text-danger" : "text-ink-soft",
                    )}
                  >
                    {isGenerating ? "正在整理本周日报…" : sourceError}
                  </p>
                ) : null}
              </div>

              <div className="border-t border-line/70 pt-3">
                <button
                  type="button"
                  onClick={() => setCustomRangeOpen((value) => !value)}
                  aria-expanded={customRangeOpen}
                  className="flex w-full items-center justify-between gap-2 text-left text-xs font-medium text-ink-soft transition-colors hover:text-ink"
                >
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    自定义汇总日期范围
                  </span>
                  {customRangeOpen ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>

                {customRangeOpen ? (
                  <div className="mt-2.5 space-y-2.5 rounded-xl border border-line/70 bg-cream/50 p-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="space-y-1">
                        <span className="block text-[11px] text-ink-soft">
                          开始
                        </span>
                        <Input
                          type="date"
                          value={sourceStartDate}
                          max={sourceEndDate}
                          disabled={busy}
                          onChange={(event) => {
                            if (event.target.value) {
                              setSourceStartDate(event.target.value);
                            }
                          }}
                          className="h-9 text-xs"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="block text-[11px] text-ink-soft">
                          结束
                        </span>
                        <Input
                          type="date"
                          value={sourceEndDate}
                          min={sourceStartDate}
                          disabled={busy}
                          onChange={(event) => {
                            if (event.target.value) {
                              setSourceEndDate(event.target.value);
                            }
                          }}
                          className="h-9 text-xs"
                        />
                      </label>
                    </div>

                    {sourceError ? (
                      <p className="text-[11px] text-danger">
                        {sourceError}
                      </p>
                    ) : null}

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-ink-soft">
                        已关联 {sourceReviews.length} 篇
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy || !isCustomSourceRange}
                        onClick={handleResetSourceRange}
                      >
                        恢复默认整周
                      </Button>
                    </div>
                  </div>
                ) : isCustomSourceRange ? (
                  <p className="mt-1 text-[11px] text-ink-soft">
                    当前汇总 {formatDateShort(sourceStartDate)} ~{" "}
                    {formatDateShort(sourceEndDate)}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2 border-t border-line/70 pt-3">
                <Button
                  variant="secondary"
                  className="w-full"
                  loading={saving}
                  disabled={!dirty || busy}
                  onClick={() => {
                    void saveReport();
                  }}
                >
                  <Save className="h-4 w-4" />
                  保存修改
                </Button>
                <p
                  className={cn(
                    "text-center text-[11px]",
                    dirty ? "text-brand-deep" : "text-ink-soft",
                  )}
                >
                  {dirty ? "有未保存改动" : report ? "已保存" : "尚未保存"}
                </p>
              </div>

              <div className="space-y-2 border-t border-line/70 pt-3">
                <Button
                  className="w-full"
                  loading={isExporting}
                  disabled={busy || (!report && !hasContent)}
                  onClick={() => {
                    void handleExport();
                  }}
                >
                  <Download className="h-4 w-4" />
                  导出 Excel (.xlsx)
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  disabled={isGenerating}
                  onClick={() => {
                    void handleCopy();
                  }}
                >
                  <Copy className="h-4 w-4" />
                  复制纯文本
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          title="覆盖当前周报？"
          description="重新生成会覆盖当前周报正文，已手动修改的内容不会保留。"
        >
          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="ghost"
              disabled={isGenerating}
              onClick={() => setConfirmOpen(false)}
            >
              取消
            </Button>
            <Button
              loading={isGenerating}
              onClick={() => {
                void runGenerate();
              }}
            >
              继续生成
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditorSection({
  index,
  title,
  children,
}: {
  index: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="px-4 py-4 sm:px-5">
      <div className="flex items-baseline gap-2">
        <span className="font-serif text-[11px] text-ink-soft/60">
          {index}
        </span>
        <h3 className="text-sm font-semibold tracking-tight text-ink">
          {title}
        </h3>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={htmlFor}
        className="text-xs font-medium text-ink-soft"
      >
        {label}
      </Label>
      {children}
    </div>
  );
}

function MetricField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="block text-[11px] font-medium text-ink-soft">
        {label}
      </span>
      <Input
        value={value}
        disabled={disabled}
        aria-label={label}
        placeholder="无"
        onChange={(event) => onChange(event.target.value)}
        className="h-9 text-sm"
      />
    </label>
  );
}
