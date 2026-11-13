"use client";

import { Lightbulb, Mic, Sparkles, Square, Users } from "lucide-react";
import { toast } from "sonner";
import { ChiikawaMascot } from "@/components/mascots";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { CORE_SECTIONS, SECTION_META, type Student } from "@/lib/types";
import { cn } from "@/lib/utils";

const RAW_INPUT_MAX_LENGTH = 6000;

function appendVoiceText(current: string, transcript: string): string {
  const chunk = transcript.trim();
  if (!chunk) return current;

  const separator =
    current.length === 0 || current.endsWith("\n") ? "" : "\n";
  const available =
    RAW_INPUT_MAX_LENGTH - current.length - separator.length;

  if (available <= 0) return current;

  return `${current}${separator}${chunk.slice(0, available)}`;
}

type Props = {
  value: string;
  students: Student[];
  hasDraft: boolean;
  questioning: boolean;
  loading: boolean;
  onChange: (value: string) => void;
  onGenerate: () => void;
};

export function RawInputCard({
  value,
  students,
  hasDraft,
  questioning,
  loading,
  onChange,
  onGenerate,
}: Props) {
  const { supported, listening, interim, error, toggle } = useVoiceInput({
    onAppend: (text) => {
      const next = appendVoiceText(value, text);
      if (next === value) {
        toast.error("已经到 6000 字上限了");
        return;
      }
      onChange(next);
    },
  });

  const atLimit = value.length >= RAW_INPUT_MAX_LENGTH;
  // 正在识别时必须始终允许点“停止”，否则到上限或开始生成后麦克风关不掉
  const voiceButtonDisabled =
    !listening && (loading || !supported || atLimit);

  return (
    <section className="paper-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-soft ring-2 ring-sky/60">
            <ChiikawaMascot className="h-10 w-10" />
          </div>
          <div>
            <h2 className="text-base font-extrabold tracking-tight text-ink">
              今天都做了什么？
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              随便写，不用组织语言。学生、家长、业绩、琐事都可以。
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-bold text-brand-deep ring-2 ring-brand/40">
          第一步
        </span>
      </div>

      {students.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-soft">
          <Users className="h-3.5 w-3.5" />
          <span>名单：</span>
          {students.slice(0, 8).map((student) => (
            <span
              key={student.id}
              className="rounded-full bg-cream-deep px-2.5 py-0.5 font-semibold text-ink-soft"
            >
              {student.name}
            </span>
          ))}
          {students.length > 8 ? <span>等 {students.length} 人</span> : null}
        </div>
      ) : (
        <p className="mt-3 rounded-2xl bg-cream-deep/70 px-3 py-2 text-[11px] leading-relaxed text-ink-soft">
          还没有学生名单，可以先去“学生”页添加林小满，AI 会更容易认出她。
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-ink-soft">工作流水账</span>
        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] text-ink-soft/70 sm:inline">
            边说边转文字
          </span>
          <button
            type="button"
            onClick={toggle}
            disabled={voiceButtonDisabled}
            aria-pressed={listening}
            aria-label={listening ? "停止语音输入" : "开始语音输入"}
            title={
              !supported
                ? "当前浏览器不支持语音输入，请使用 Chrome、Safari 或 Edge"
                : listening
                  ? "停止语音输入"
                  : "开始语音输入"
            }
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border-2 px-3.5 text-xs font-bold transition-all",
              listening
                ? "border-brand-deep bg-brand text-cocoa shadow-[0_2px_0_#c96b85]"
                : "border-line bg-paper text-ink-soft shadow-[0_2px_0_#eadccd] hover:border-brand hover:text-ink",
              voiceButtonDisabled && "cursor-not-allowed opacity-50",
            )}
          >
            {listening ? (
              <Square className="h-3.5 w-3.5 fill-current" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
            {listening ? "停止识别" : "语音输入"}
            {listening ? (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-deep opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-deep" />
              </span>
            ) : null}
          </button>
        </div>
      </div>

      <Textarea
        value={value}
        disabled={loading}
        onChange={(event) => onChange(event.target.value)}
        placeholder={
          "比如：\n今天林小满作业写完了，错题讲了两道；跟她妈妈微信说了下这周安排；另外把错题录到小橙AI了。"
        }
        className="notebook-lines mt-2 min-h-[220px] resize-y bg-paper text-[15px] leading-8"
        maxLength={RAW_INPUT_MAX_LENGTH}
      />

      {listening ? (
        <div
          aria-live="polite"
          className="mt-2 flex items-start gap-2 rounded-2xl bg-sky-soft px-3 py-2 text-[11px] leading-relaxed text-[#4e7f99] ring-1 ring-sky/50"
        >
          <span className="mt-1 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-brand-deep motion-reduce:animate-none" />
          <span className="min-w-0 break-words">
            {interim ? `正在识别：${interim}` : "正在听，请开始说话…"}
          </span>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-2 rounded-2xl bg-[#fde8e8] px-3 py-2 text-[11px] leading-relaxed text-[#b35454] ring-1 ring-[#e4b1b1]"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-ink-soft">
        <span>写不完整没关系，AI 会追问。</span>
        <span className="shrink-0">
          {value.length} / {RAW_INPUT_MAX_LENGTH}
        </span>
      </div>

      {!hasDraft ? (
        <div className="mt-4 hidden md:flex md:justify-end">
          <Button
            onClick={onGenerate}
            loading={loading}
            size="lg"
            className="min-w-[150px]"
          >
            {!loading ? <Sparkles className="h-4 w-4" /> : null}
            {questioning ? "重新分析" : "生成复盘"}
          </Button>
        </div>
      ) : null}

      <details className="mt-4 rounded-2xl border-2 border-line/60 bg-cream-deep/50 px-3.5 py-3 text-sm text-ink-soft">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-bold text-ink-soft">
          <Lightbulb className="h-4 w-4 text-[#c79a45]" />
          不知道怎么写？看栏目提示
        </summary>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {CORE_SECTIONS.map((key) => (
            <div
              key={key}
              className="rounded-2xl bg-paper px-3 py-2 ring-1 ring-line/60"
            >
              <div className="text-xs font-bold text-ink">
                {SECTION_META[key].title}
              </div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">
                {SECTION_META[key].description}
              </div>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
