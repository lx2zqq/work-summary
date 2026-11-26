"use client";

import {
  ArrowRight,
  Brain,
  MessageSquare,
  SkipForward,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EMPTY_ANSWER,
  buildAnswer,
  clearAnswerSkip,
  isRichangQuestion,
  setAnswerCustom,
  setAnswerSkip,
  toggleAnswerOption,
  type QuestionAnswer,
} from "@/lib/answers";
import type {
  FollowUpQuestion,
  MemoryPromptItem,
  QAPair,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  questions: FollowUpQuestion[];
  round: number;
  maxRounds: number;
  loading: boolean;
  memories: MemoryPromptItem[];
  initialAnswers?: Record<string, QuestionAnswer>;
  onSubmit: (answers: QAPair[]) => void;
  onSkip: () => void;
  /** 演示模式：记忆链接改为登录页 */
  demoMode?: boolean;
};

export function QuestionsCard({
  questions,
  round,
  maxRounds,
  loading,
  memories,
  initialAnswers,
  onSubmit,
  onSkip,
  demoMode = false,
}: Props) {
  const [answers, setAnswers] = useState<Record<string, QuestionAnswer>>(
    () => initialAnswers ?? {},
  );

  function getAnswer(id: string): QuestionAnswer {
    return answers[id] ?? EMPTY_ANSWER;
  }

  function toggleOption(question: FollowUpQuestion, option: string) {
    setAnswers((previous) => ({
      ...previous,
      [question.id]: toggleAnswerOption(
        previous[question.id] ?? EMPTY_ANSWER,
        option,
        question.multiple,
      ),
    }));
  }

  function setCustom(question: FollowUpQuestion, value: string) {
    setAnswers((previous) => ({
      ...previous,
      [question.id]: setAnswerCustom(
        previous[question.id] ?? EMPTY_ANSWER,
        value,
      ),
    }));
  }

  function skipQuestion(question: FollowUpQuestion) {
    setAnswers((previous) => ({
      ...previous,
      [question.id]: setAnswerSkip(
        previous[question.id] ?? EMPTY_ANSWER,
      ),
    }));
  }

  function undoSkip(question: FollowUpQuestion) {
    setAnswers((previous) => ({
      ...previous,
      [question.id]: clearAnswerSkip(
        previous[question.id] ?? EMPTY_ANSWER,
      ),
    }));
  }

  function handleSubmit() {
    const pairs = questions
      .map((question) => {
        const state = getAnswer(question.id);

        return {
          question: question.text,
          // 跳过标记只允许出现在日常复盘追问上，其他追问绝不带出
          answer: buildAnswer({
            ...state,
            aiSkip: isRichangQuestion(question) && state.aiSkip === true,
          }),
        };
      })
      .filter((pair) => pair.answer.length > 0);

    if (pairs.length === 0) {
      toast.error("先选一个答案，或直接跳过追问");
      return;
    }

    onSubmit(pairs);
  }

  return (
    <section
      className="flex flex-col rounded-2xl border border-line/70 bg-canvas p-3 sm:p-4 lg:min-h-[640px]"
      onKeyDown={(event) => {
        // 卡片内任意位置 Ctrl / ⌘ + Enter 都能提交追问
        if (
          event.key === "Enter" &&
          (event.metaKey || event.ctrlKey) &&
          !event.nativeEvent.isComposing
        ) {
          event.preventDefault();
          if (!loading) handleSubmit();
        }
      }}
    >
      <header className="flex items-start justify-between gap-2 px-1 pb-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-paper text-brand-deep ring-1 ring-line/60">
            <MessageSquare className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-ink">
                需要再确认 {questions.length} 件事
              </h2>
              <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] font-medium text-brand-deep ring-1 ring-brand/30">
                第 {Math.min(round + 1, maxRounds)} / {maxRounds} 轮
              </span>
            </div>
            {memories.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-ink-soft">
                <Brain className="h-3 w-3 text-brand-deep" />
                {memories.slice(0, 3).map((memory) => (
                  <span
                    key={memory.id}
                    title={memory.content}
                    className="rounded-full bg-paper px-2 py-0.5 font-medium text-ink-soft ring-1 ring-line/60"
                  >
                    {memory.scope === "student"
                      ? memory.studentName || "未关联学生"
                      : "通用"}
                    ·{memory.category}
                  </span>
                ))}
                {memories.length > 3 ? (
                  <span
                    className="rounded-full bg-paper px-2 py-0.5 font-medium text-ink-soft ring-1 ring-line/60"
                    title={`还有 ${memories.length - 3} 条记忆`}
                  >
                    +{memories.length - 3}
                  </span>
                ) : null}
                <Link
                  href={demoMode ? "/login" : "/memories"}
                  className="underline"
                >
                  查看
                </Link>
              </div>
            ) : null}
          </div>
        </div>

        <Badge tone="amber" className="shrink-0">
          待补全
        </Badge>
      </header>

      <div className="flex-1 space-y-3.5 px-0.5">
        {questions.map((question, index) => {
          const state = getAnswer(question.id);
          // 严格隔离：只有日常复盘追问才展示“跳过，由 AI 提炼”
          const richang = isRichangQuestion(question);
          const skipped = richang && state.aiSkip === true;

          return (
            <div
              key={question.id}
              className="rounded-xl border border-line/70 bg-paper p-3.5"
            >
              <div className="flex gap-2 text-sm font-medium text-ink">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-butter-soft text-[11px] text-warning">
                  {index + 1}
                </span>
                <span className="leading-relaxed">
                  {question.text}
                  {question.multiple ? (
                    <span className="ml-2 inline-block whitespace-nowrap rounded-full bg-sky-soft px-2 py-0.5 align-middle text-[10px] font-medium text-info">
                      可多选
                    </span>
                  ) : null}
                </span>
              </div>

              {skipped ? (
                <div
                  role="status"
                  className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-brand-soft px-2.5 py-1.5 text-[11px] text-brand-deep"
                >
                  <Sparkles className="h-3.5 w-3.5 shrink-0" />
                  <span>已跳过，将由 AI 结合今日工作提炼优化建议</span>
                  <button
                    type="button"
                    onClick={() => undoSkip(question)}
                    className="font-medium underline underline-offset-2 transition-colors hover:text-brand-strong"
                  >
                    改为自己写
                  </button>
                </div>
              ) : (
                <>
                  {question.options.length > 0 ? (
                    <div className="mt-2.5 flex flex-wrap gap-2 pl-7">
                      {question.options.map((option, optionIndex) => {
                        const selected = state.selected.includes(option);

                        return (
                          <button
                            key={`${question.id}-option-${optionIndex}-${option}`}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => toggleOption(question, option)}
                            className={cn(
                              "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                              selected
                                ? "border-brand-deep bg-brand-deep text-white"
                                : "border-line bg-paper text-ink-soft hover:bg-cream-deep hover:text-ink",
                            )}
                          >
                            {option}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

                  {richang ? (
                    <div className="mt-2 pl-7">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => skipQuestion(question)}
                        disabled={loading}
                        className="h-7 px-2 text-[11px] text-brand-deep hover:bg-brand-soft hover:text-brand-strong"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        跳过，由 AI 提炼
                      </Button>
                    </div>
                  ) : null}

                  <Input
                    value={state.custom}
                    aria-label={`第 ${index + 1} 个问题的补充说明`}
                    onChange={(event) =>
                      setCustom(question, event.target.value)
                    }
                    placeholder={
                      question.options.length > 0
                        ? question.multiple
                          ? "补充说明，可多选…"
                          : "补充说明（可选）…"
                        : "直接写答案…"
                    }
                    className="mt-2.5 h-9 bg-paper text-xs"
                  />
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-col-reverse gap-2 border-t border-line/60 px-1 pt-3 sm:flex-row sm:justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={onSkip}
          disabled={loading}
        >
          <SkipForward className="h-4 w-4" />
          跳过追问并生成
        </Button>
        <Button
          size="sm"
          onClick={handleSubmit}
          loading={loading}
          title="提交并继续（Ctrl / ⌘ + Enter）"
        >
          提交并继续
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}
