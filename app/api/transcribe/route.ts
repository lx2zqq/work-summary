import { NextResponse } from "next/server";
import {
  rateLimitExceeded,
  requireApiSession,
} from "@/lib/api-helpers";
import { isWavHeader } from "@/lib/audio/wav";
import { checkAiRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_BASE_URL = "https://api.siliconflow.cn/v1";
const DEFAULT_MODEL = "FunAudioLLM/SenseVoiceSmall";
// 单文件上限 4MB，足够 60 秒 16kHz 单声道 WAV
const MAX_FILE_BYTES = 4 * 1024 * 1024;
// Content-Length 还包含 multipart 边界和其他字段，单独留一点余量
const MAX_FORM_BYTES = MAX_FILE_BYTES + 64 * 1024;

function isUploadedFile(
  value: FormDataEntryValue | null | undefined,
): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as File).arrayBuffer === "function" &&
    typeof (value as File).name === "string" &&
    typeof (value as File).size === "number"
  );
}

function isWavFile(file: File): boolean {
  return (
    file.type === "audio/wav" ||
    file.type === "audio/wave" ||
    file.type === "audio/x-wav" ||
    file.name.toLowerCase().endsWith(".wav")
  );
}

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const limit = checkAiRateLimit(request, "transcribe");
  if (!limit.allowed) return rateLimitExceeded(limit.retryAfter);

  // 先看 Content-Length，明显超限时不必把整个请求体读进内存
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_FORM_BYTES) {
    return NextResponse.json(
      { error: "录音太长了，请控制在 60 秒以内" },
      { status: 413 },
    );
  }

  const apiKey = process.env.REVIEW_ASR_API_KEY?.trim();

  if (!apiKey) {
    return NextResponse.json(
      { error: "语音转写服务暂时不可用，可以先直接打字。" },
      { status: 503 },
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");

  if (!isUploadedFile(file) || file.size === 0) {
    return NextResponse.json(
      { error: "没有收到录音文件" },
      { status: 400 },
    );
  }

  if (!isWavFile(file)) {
    return NextResponse.json(
      { error: "录音格式不对，请重新录一次" },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "录音太长了，请控制在 60 秒以内" },
      { status: 413 },
    );
  }

  // 扩展名和 MIME 都能伪造，再确认一次真正的 RIFF/WAVE 头
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!isWavHeader(header)) {
    return NextResponse.json(
      { error: "录音格式不对，请重新录一次" },
      { status: 400 },
    );
  }

  const baseUrl = (
    process.env.REVIEW_ASR_BASE_URL?.trim() || DEFAULT_BASE_URL
  ).replace(/\/+$/, "");
  const model =
    process.env.REVIEW_ASR_MODEL?.trim() || DEFAULT_MODEL;

  const upstreamForm = new FormData();
  upstreamForm.append("file", file, file.name || "voice.wav");
  upstreamForm.append("model", model);

  try {
    const response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstreamForm,
      signal: AbortSignal.timeout(45_000),
    });

    const raw = await response.text();

    if (!response.ok) {
      console.error(
        "[transcribe:asr]",
        response.status,
        raw.slice(0, 300),
      );
      return NextResponse.json(
        { error: "语音转写服务暂时不可用，请稍后重试或直接打字。" },
        { status: 502 },
      );
    }

    let data: unknown;

    try {
      data = JSON.parse(raw);
    } catch {
      console.error("[transcribe:asr] 上游返回不是合法 JSON");
      return NextResponse.json(
        { error: "语音转写服务暂时不可用，请稍后重试或直接打字。" },
        { status: 502 },
      );
    }

    const text =
      data &&
      typeof data === "object" &&
      typeof (data as { text?: unknown }).text === "string"
        ? (data as { text: string }).text.replace(/<\|[^|]*\|>/g, "").trim()
        : null;

    if (text === null) {
      console.error("[transcribe:asr] 上游响应缺少 text 字段");
      return NextResponse.json(
        { error: "语音转写服务暂时不可用，请稍后重试或直接打字。" },
        { status: 502 },
      );
    }

    if (!text) {
      return NextResponse.json(
        { error: "没有识别出内容，请靠近麦克风再说一次。" },
        { status: 422 },
      );
    }

    return NextResponse.json({ text });
  } catch (error) {
    console.error("[transcribe:request]", error);

    const timeout =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");

    return NextResponse.json(
      {
        error: timeout
          ? "语音转写超时了，请缩短录音后重试。"
          : "语音转写失败，请检查网络后重试。",
      },
      { status: 502 },
    );
  }
}
