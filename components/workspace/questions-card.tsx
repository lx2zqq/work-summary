"use client";

import { Brain, SkipForward, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { HachiwareMascot } from "@/components/mascots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EMPTY_ANSWER,
  buildAnswer,
  setAnswerCustom,
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

  function handleSubmit() {
    const pairs = questions
      .map((question) => ({
        question: question.text,
        answer: buildAnswer(getAnswer(question.id)),
      }))
      .filter((pair) => pair.answer.length > 0);

    if (pairs.length === 0) {
      toast.error("先选一个答案，或直接跳过追问");
      return;
    }

    onSubmit(pairs);
  }

  return (
    <section className="rounded-[26px] border-2 border-brand/40 bg-brand-soft/50 p-4 shadow-[0_4px_0_#f0d4dd] sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-paper ring-2 ring-brand/40">
          <HachiwareMascot className="h-10 w-10" mood="sad" />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-extrabold text-ink">
              AI 想确认 {questions.length} 件事
            </h2>
            <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] font-bold text-brand-deep ring-1 ring-brand/30">
              第 {round + 1} / {maxRounds} 轮
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            选项和补充可以同时填。
          </p>
          {memories.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-ink-soft">
              <Brain className="h-3 w-3 text-brand-deep" />
              {memories.slice(0, 3).map((memory) => (
                <span
                  key={memory.id}
                  title={memory.content}
                  className="rounded-full bg-paper px-2 py-0.5 font-semibold text-ink-soft ring-1 ring-line/60"
                >
                  {memory.scope === "student"
                    ? memory.studentName || "未关联学生"
                    : "通用"}
                  ·{memory.category}
                </span>
              ))}
              {memories.length > 3 ? (
                <span
                  className="rounded-full bg-paper px-2 py-0.5 font-semibold text-ink-soft ring-1 ring-line/60"
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

      <div className="mt-4 space-y-3.5">
        {questions.map((question, index) => {
          const state = getAnswer(question.id);

          return (
            <div
              key={question.id}
              className="rounded-2xl border-2 border-line/70 bg-paper p-3.5 shadow-[0_2px_0_#f0e4d6]"
            >
              <div className="flex gap-2 text-sm font-bold text-ink">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-butter-soft text-[11px] text-[#8a6a2f]">
                  {index + 1}
                </span>
                <span className="leading-relaxed">
                  {question.text}
                  {question.multiple ? (
                    <span className="ml-2 inline-block whitespace-nowrap rounded-full bg-sky-soft px-2 py-0.5 align-middle text-[10px] font-bold text-[#4e7f99]">
                      可多选
                    </span>
                  ) : null}
                </span>
              </div>

              {question.options.length > 0 ? (
                <div className="mt-2.5 flex flex-wrap gap-2 pl-7">
                  {question.options.map((option) => {
                    const selected = state.selected.includes(option);

                    return (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleOption(question, option)}
                        className={cn(
                          "rounded-full border-2 px-3 py-1.5 text-xs font-bold transition-all",
                          selected
                            ? "border-brand-deep bg-brand text-cocoa shadow-[0_2px_0_#c96b85]"
                            : "border-line bg-paper text-ink-soft hover:border-brand hover:text-ink",
                        )}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              <Input
                value={state.custom}
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
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={onSkip}
          disabled={loading}
        >
          <SkipForward className="h-4 w-4" />
          跳过追问并生成
        </Button>
        <Button size="sm" onClick={handleSubmit} loading={loading}>
          <Sparkles className="h-4 w-4" />
          提交并继续
        </Button>
      </div>
    </section>
  );
}
