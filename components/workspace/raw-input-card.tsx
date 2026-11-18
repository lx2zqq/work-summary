"use client";

import {
  Lightbulb,
  Loader2,
  Mic,
  Sparkles,
  Square,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { ChiikawaMascot } from "@/components/mascots";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useRecordingInput } from "@/hooks/use-recording-input";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { CORE_SECTIONS, SECTION_META, type Student } from "@/lib/types";
import { cn } from "@/lib/utils";

const RAW_INPUT_MAX_LENGTH = 6000;

// 安卓微信的 Web Speech API 是空壳，直接走录音转写
function isAndroidWeChat(): boolean {
  if (typeof navigator === "undefined") return false;

  const ua = navigator.userAgent;
  return /MicroMessenger/i.test(ua) && /Android/i.test(ua);
}

function subscribeUserAgent() {
  return () => {};
}

function getAndroidWeChatSnapshot() {
  return isAndroidWeChat();
}

function getHydratedSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

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
  /** 演示模式：隐藏语音（会调转写接口），链接改登录页 */
  demoMode?: boolean;
};

export function RawInputCard({
  value,
  students,
  hasDraft,
  questioning,
  loading,
  onChange,
  onGenerate,
  demoMode = false,
}: Props) {
  const [forceRecorder, setForceRecorder] = useState(false);
  const androidWeChat = useSyncExternalStore(
    subscribeUserAgent,
    getAndroidWeChatSnapshot,
    getServerSnapshot,
  );
  const hydrated = useSyncExternalStore(
    subscribeUserAgent,
    getHydratedSnapshot,
    getServerSnapshot,
  );

  const appendTranscript = useCallback(
    (text: string) => {
      const next = appendVoiceText(value, text);

      if (next === value) {
        toast.error("已经到 6000 字上限了");
        return;
      }

      onChange(next);
    },
    [value, onChange],
  );

  const handleSpeechUnavailable = useCallback(() => {
    setForceRecorder(true);
    toast.info(
      "当前浏览器语音识别不可用，已切换为录音转写，请再点一次麦克风。",
    );
  }, []);

  const speech = useVoiceInput({
    onAppend: appendTranscript,
    onUnavailable: handleSpeechUnavailable,
  });
  const recorder = useRecordingInput({ onAppend: appendTranscript });

  const recordingMode =
    androidWeChat || forceRecorder || !speech.supported;
  const activeVoice = speech.listening || recorder.recording;
  // hydration 前先按“支持”渲染，避免服务端和客户端首屏不一致
  const voiceSupported = !hydrated
    ? true
    : recordingMode
      ? recorder.supported
      : speech.supported;
  const voiceError = recordingMode ? recorder.error : speech.error;

  const atLimit = value.length >= RAW_INPUT_MAX_LENGTH;
  // 正在识别/录音时必须始终允许点“停止”，否则到上限或开始生成后麦克风关不掉
  const voiceButtonDisabled =
    recorder.transcribing ||
    (!activeVoice &&
      (loading || !voiceSupported || atLimit));

  function handleVoiceToggle() {
    if (recordingMode) {
      recorder.toggle();
      return;
    }

    speech.toggle();
  }

  const voiceLabel = recorder.transcribing
    ? "正在转写…"
    : recorder.recording
      ? `停止并转写 ${formatSeconds(recorder.seconds)}`
      : speech.listening
        ? "停止识别"
        : "语音输入";

  const voiceTitle = !voiceSupported
    ? "当前浏览器不支持语音输入，请直接打字"
    : recorder.transcribing
      ? "正在把录音转成文字"
      : recorder.recording
        ? "停止录音并转写"
        : speech.listening
          ? "停止语音输入"
          : "开始语音输入";

  return (
    <section className="paper-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-soft ring-2 ring-sky/60">
          <ChiikawaMascot className="h-10 w-10" />
        </div>
        <div>
          <h2 className="text-base font-extrabold tracking-tight text-ink">
            今天都做了什么？
          </h2>
        </div>
      </div>

      {students.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-soft">
          <Users className="h-3.5 w-3.5" />
          {students.slice(0, 8).map((student) => (
            <span
              key={student.id}
              className="rounded-full bg-cream-deep px-2.5 py-0.5 font-semibold text-ink-soft"
            >
              {student.name}
            </span>
          ))}
          {students.length > 8 ? (
            <span
              className="rounded-full bg-cream-deep px-2.5 py-0.5 font-semibold text-ink-soft"
              title={`还有 ${students.length - 8} 位学生`}
            >
              +{students.length - 8}
            </span>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-soft">
          <Users className="h-3.5 w-3.5" />
          <span>还没有学生名单</span>
          <Link
            href={demoMode ? "/login" : "/students"}
            className="font-bold text-brand-deep underline underline-offset-2"
          >
            去添加
          </Link>
        </div>
      )}

      {demoMode ? null : (
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={handleVoiceToggle}
          disabled={voiceButtonDisabled}
          aria-pressed={activeVoice}
          aria-label={voiceTitle}
          title={voiceTitle}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border-2 px-3.5 text-xs font-bold transition-all",
            activeVoice
              ? "border-brand-deep bg-brand text-cocoa shadow-[0_2px_0_#c96b85]"
              : recorder.transcribing
                ? "border-brand/50 bg-brand-soft text-brand-deep"
                : "border-line bg-paper text-ink-soft shadow-[0_2px_0_#eadccd] hover:border-brand hover:text-ink",
            voiceButtonDisabled && "cursor-not-allowed opacity-50",
          )}
        >
          {recorder.transcribing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : activeVoice ? (
            <Square className="h-3.5 w-3.5 fill-current" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
          {voiceLabel}
          {activeVoice ? (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-deep opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-deep" />
            </span>
          ) : null}
        </button>
      </div>
      )}

      <Textarea
        aria-label="工作流水账"
        value={value}
        disabled={loading}
        onChange={(event) => onChange(event.target.value)}
        placeholder={
          "今天做了什么？随便写，学生、家长、业绩、琐事都可以。\n比如：林小满作业写完了，错题讲了两道；跟她妈妈微信说了这周安排。\n写不完整也没关系，AI 会追问。"
        }
        className="notebook-lines mt-2 min-h-[220px] resize-y bg-paper text-[15px] leading-8"
        maxLength={RAW_INPUT_MAX_LENGTH}
      />

      {speech.listening ? (
        <div
          aria-live="polite"
          className="mt-2 flex items-start gap-2 rounded-2xl bg-sky-soft px-3 py-2 text-[11px] leading-relaxed text-[#4e7f99] ring-1 ring-sky/50"
        >
          <span className="mt-1 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-brand-deep motion-reduce:animate-none" />
          <span className="min-w-0 break-words">
            {speech.interim
              ? `正在识别：${speech.interim}`
              : "正在听，请开始说话…"}
          </span>
        </div>
      ) : recorder.recording ? (
        <div
          aria-live="polite"
          className="mt-2 flex items-start gap-2 rounded-2xl bg-sky-soft px-3 py-2 text-[11px] leading-relaxed text-[#4e7f99] ring-1 ring-sky/50"
        >
          <span className="mt-1 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-brand-deep motion-reduce:animate-none" />
          <span className="min-w-0 break-words">
            正在录音 {formatSeconds(recorder.seconds)}，点“停止并转写”后自动变成文字
          </span>
        </div>
      ) : recorder.transcribing ? (
        <div
          aria-live="polite"
          className="mt-2 flex items-start gap-2 rounded-2xl bg-sky-soft px-3 py-2 text-[11px] leading-relaxed text-[#4e7f99] ring-1 ring-sky/50"
        >
          <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
          <span className="min-w-0 break-words">
            正在把录音转成文字，请稍候…
          </span>
        </div>
      ) : null}

      {voiceError ? (
        <p
          role="alert"
          className="mt-2 rounded-2xl bg-[#fde8e8] px-3 py-2 text-[11px] leading-relaxed text-[#b35454] ring-1 ring-[#e4b1b1]"
        >
          {voiceError}
        </p>
      ) : null}

      {hydrated && !voiceSupported ? (
        <p className="mt-2 rounded-2xl bg-cream-deep px-3 py-2 text-[11px] leading-relaxed text-ink-soft ring-1 ring-line/60">
          当前浏览器不支持语音输入，请直接打字。
        </p>
      ) : null}

      <div className="mt-2 flex justify-end text-[11px] text-ink-soft">
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
          栏目提示
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
