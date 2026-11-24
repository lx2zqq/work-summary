"use client";

import {
  ChevronDown,
  Lightbulb,
  Loader2,
  Mic,
  Plus,
  Square,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useRecordingInput } from "@/hooks/use-recording-input";
import { useVoiceInput } from "@/hooks/use-voice-input";
import {
  CORE_SECTIONS,
  SECTION_META,
  type ReviewStyle,
  type Student,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { WorkspaceDate, type SaveStatus } from "./workspace-date";

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
  style: ReviewStyle;
  date: string;
  today: string;
  saveStatus: SaveStatus;
  switchingDate: boolean;
  canSave: boolean;
  /** 右侧面板已有可操作主按钮时，左侧生成按钮降级为次按钮 */
  primaryAction?: boolean;
  onChange: (value: string) => void;
  onStyleChange: (style: ReviewStyle) => void;
  onGenerate: () => void;
  onDateChange: (date: string) => void;
  onSave: () => void;
  /** 演示模式：隐藏语音和日期切换，链接改登录页 */
  demoMode?: boolean;
  dateReadOnly?: boolean;
};

export function RawInputCard({
  value,
  students,
  hasDraft,
  questioning,
  loading,
  style,
  date,
  today,
  saveStatus,
  switchingDate,
  canSave,
  primaryAction = true,
  onChange,
  onStyleChange,
  onGenerate,
  onDateChange,
  onSave,
  demoMode = false,
  dateReadOnly = false,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // 没点过写作区时，快捷插入默认追加到末尾，而不是插到第 0 个字符
  const touchedRef = useRef(false);
  const [forceRecorder, setForceRecorder] = useState(false);
  // 学生超过 8 位时，+N 可展开全部名单
  const [showAllStudents, setShowAllStudents] = useState(false);
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

  function insertStudent(name: string) {
    if (loading) return;

    const snippet = `${name}：`;
    const element = textareaRef.current;

    if (!element) {
      onChange(`${value}${snippet}`.slice(0, RAW_INPUT_MAX_LENGTH));
      return;
    }

    const start = touchedRef.current
      ? element.selectionStart ?? value.length
      : value.length;
    const end = touchedRef.current ? element.selectionEnd ?? start : value.length;
    const next = `${value.slice(0, start)}${snippet}${value.slice(end)}`.slice(
      0,
      RAW_INPUT_MAX_LENGTH,
    );

    onChange(next);
    requestAnimationFrame(() => {
      element.focus();
      const caret = Math.min(start + snippet.length, next.length);
      element.setSelectionRange(caret, caret);
    });
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
    <section className="paper-card flex flex-col overflow-hidden lg:min-h-[640px]">
      <WorkspaceDate
        date={date}
        today={today}
        status={saveStatus}
        switching={switchingDate}
        canSave={canSave}
        loading={loading}
        readOnly={dateReadOnly}
        onDateChange={onDateChange}
        onSave={onSave}
      />

      <div className="flex flex-wrap items-center gap-1.5 border-b border-line/60 px-3 py-2.5 sm:px-4">
        <span className="mr-1 flex items-center gap-1 text-[11px] text-ink-soft">
          <Users className="h-3.5 w-3.5" />
          快捷插入
        </span>

        {students.length > 0 ? (
          <>
            {(showAllStudents ? students : students.slice(0, 8)).map(
              (student) => (
                <button
                  key={student.id}
                  type="button"
                  disabled={loading}
                  title={`把「${student.name}」插入到光标处`}
                  onClick={() => insertStudent(student.name)}
                  className="inline-flex items-center gap-0.5 rounded-full border border-line bg-paper px-2.5 py-1 text-[11px] font-medium text-ink-soft transition-colors hover:border-brand/40 hover:bg-brand-soft hover:text-brand-deep disabled:opacity-50"
                >
                  <Plus className="h-3 w-3" />
                  {student.name}
                </button>
              ),
            )}
            {students.length > 8 ? (
              <button
                type="button"
                disabled={loading}
                aria-expanded={showAllStudents}
                title={
                  showAllStudents
                    ? "收起学生名单"
                    : `展开其余 ${students.length - 8} 位学生`
                }
                onClick={() => setShowAllStudents((current) => !current)}
                className="inline-flex items-center gap-0.5 rounded-full border border-transparent bg-cream-deep px-2.5 py-1 text-[11px] font-medium text-ink-soft transition-colors hover:bg-brand-soft hover:text-brand-deep disabled:opacity-50"
              >
                {showAllStudents ? "收起" : `+${students.length - 8}`}
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform",
                    showAllStudents && "rotate-180",
                  )}
                />
              </button>
            ) : null}
          </>
        ) : (
          <span className="text-[11px] text-ink-soft">
            还没有学生名单
            <Link
              href={demoMode ? "/login" : "/students"}
              className="ml-1 font-medium text-brand-deep underline underline-offset-2"
            >
              去添加
            </Link>
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col px-3 py-2 sm:px-4">
        <Textarea
          ref={textareaRef}
          aria-label="工作流水账"
          value={value}
          disabled={loading}
          onFocus={() => {
            touchedRef.current = true;
          }}
          onClick={() => {
            touchedRef.current = true;
          }}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            // 输入框内 Ctrl / ⌘ + Enter 直接生成
            if (
              event.key === "Enter" &&
              (event.metaKey || event.ctrlKey) &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              if (!loading && value.trim()) onGenerate();
            }
          }}
          placeholder="记录今天的工作内容…"
          className="notebook-lines min-h-[280px] flex-1 resize-y rounded-none border-0 bg-transparent px-0 py-0 text-[15px] leading-8 shadow-none focus:ring-0"
          maxLength={RAW_INPUT_MAX_LENGTH}
        />

        {speech.listening ? (
          <div
            aria-live="polite"
            className="mb-2 mt-2 flex items-start gap-2 rounded-lg bg-sky-soft px-3 py-2 text-[11px] leading-relaxed text-info ring-1 ring-sky/50"
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
            className="mb-2 mt-2 flex items-start gap-2 rounded-lg bg-sky-soft px-3 py-2 text-[11px] leading-relaxed text-info ring-1 ring-sky/50"
          >
            <span className="mt-1 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-brand-deep motion-reduce:animate-none" />
            <span className="min-w-0 break-words">
              正在录音 {formatSeconds(recorder.seconds)}
              ，点“停止并转写”后自动变成文字
            </span>
          </div>
        ) : recorder.transcribing ? (
          <div
            aria-live="polite"
            className="mb-2 mt-2 flex items-start gap-2 rounded-lg bg-sky-soft px-3 py-2 text-[11px] leading-relaxed text-info ring-1 ring-sky/50"
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
            className="mb-2 mt-2 rounded-lg bg-danger-soft px-3 py-2 text-[11px] leading-relaxed text-danger ring-1 ring-danger-line"
          >
            {voiceError}
          </p>
        ) : null}

        {hydrated && !voiceSupported ? (
          <p className="mb-2 mt-2 rounded-lg bg-cream-deep px-3 py-2 text-[11px] leading-relaxed text-ink-soft ring-1 ring-line/60">
            当前浏览器不支持语音输入，请直接打字。
          </p>
        ) : null}
      </div>

      <details className="mx-3 mb-3 rounded-lg border border-line/60 bg-cream-deep/40 px-3 py-2 text-sm text-ink-soft sm:mx-4">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-ink-soft">
          <Lightbulb className="h-3.5 w-3.5 text-warning" />
          栏目提示
        </summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {CORE_SECTIONS.map((key) => (
            <div
              key={key}
              className="rounded-lg bg-paper px-3 py-2 ring-1 ring-line/60"
            >
              <div className="text-xs font-medium text-ink">
                {SECTION_META[key].title}
              </div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">
                {SECTION_META[key].description}
              </div>
            </div>
          ))}
        </div>
      </details>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/70 px-3 py-3 sm:px-4">
        <div className="flex items-center gap-2">
          {demoMode ? null : (
            <button
              type="button"
              onClick={handleVoiceToggle}
              disabled={voiceButtonDisabled}
              aria-pressed={activeVoice}
              aria-label={voiceTitle}
              title={voiceTitle}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors",
                activeVoice
                  ? "border-transparent bg-brand-deep text-white"
                  : recorder.transcribing
                    ? "border-brand/30 bg-brand-soft text-brand-deep"
                    : "border-line bg-paper text-ink-soft hover:bg-cream-deep hover:text-ink",
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
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-60 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                </span>
              ) : null}
            </button>
          )}

          <span className="text-[11px] text-ink-soft">
            {value.length} / {RAW_INPUT_MAX_LENGTH}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className={cn(
              "transition-opacity",
              loading && "pointer-events-none opacity-50",
            )}
          >
            <Segmented
              options={[
                { value: "concise", label: "简洁" },
                { value: "detailed", label: "详细" },
              ]}
              value={style}
              onChange={onStyleChange}
              ariaLabel="文风"
            />
          </div>

          <Button
            variant={primaryAction ? "primary" : "secondary"}
            onClick={onGenerate}
            loading={loading}
            disabled={!value.trim()}
            title={
              value.trim()
                ? `${questioning ? "重新分析" : hasDraft ? "重新生成" : "生成复盘"}（Ctrl / ⌘ + Enter）`
                : "先写一点今天的流水账"
            }
          >
            {questioning ? "重新分析" : hasDraft ? "重新生成" : "生成复盘"}
          </Button>
        </div>
      </div>
    </section>
  );
}
