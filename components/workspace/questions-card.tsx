"use client";

import { SkipForward, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { HachiwareMascot } from "@/components/mascots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FollowUpQuestion, QAPair } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  questions: FollowUpQuestion[];
  round: number;
  maxRounds: number;
  loading: boolean;
  onSubmit: (answers: QAPair[]) => void;
  onSkip: () => void;
};

type AnswerState = {
  selected: string[];
  custom: string;
};

const EMPTY_ANSWER: AnswerState = { selected: [], custom: "" };

export function QuestionsCard({
  questions,
  round,
  maxRounds,
  loading,
  onSubmit,
  onSkip,
}: Props) {
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});

  function getAnswer(id: string): AnswerState {
    return answers[id] ?? EMPTY_ANSWER;
  }

  function toggleOption(question: FollowUpQuestion, option: string) {
    setAnswers((previous) => {
      const current = previous[question.id] ?? EMPTY_ANSWER;

      if (question.multiple) {
        const selected = current.selected.includes(option)
          ? current.selected.filter((item) => item !== option)
          : [...current.selected, option];

        return {
          ...previous,
          [question.id]: { ...current, selected },
        };
      }

      // 单选：再次点击已选项可以取消；选其他选项时替换
      const selected =
        current.selected.length === 1 && current.selected[0] === option
          ? []
          : [option];

      return {
        ...previous,
        [question.id]: { selected, custom: "" },
      };
    });
  }

  function setCustom(question: FollowUpQuestion, value: string) {
    setAnswers((previous) => {
      const current = previous[question.id] ?? EMPTY_ANSWER;

      return {
        ...previous,
        [question.id]: {
          // 单选问题输入自定义答案时，清掉已选选项，避免答案互相矛盾
          selected: question.multiple ? current.selected : [],
          custom: value,
        },
      };
    });
  }

  function buildAnswer(state: AnswerState): string {
    const parts: string[] = [];

    if (state.selected.length > 0) {
      parts.push(state.selected.join("、"));
    }
    if (state.custom.trim()) {
      parts.push(state.custom.trim());
    }

    return parts.join("；");
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
            点选项或直接写；多选问题可以选多个。回答完或跳过后，才会生成复盘正文。
          </p>
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
                      ? "其他补充，可多选…"
                      : "其他补充…"
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
