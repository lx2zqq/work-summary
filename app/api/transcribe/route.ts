import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_BASE_URL = "https://api.siliconflow.cn/v1";
const DEFAULT_MODEL = "FunAudioLLM/SenseVoiceSmall";
// Vercel 函数请求体上限 4.5MB，这里再留一点余量
const MAX_FILE_BYTES = 4 * 1024 * 1024;

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

  const apiKey = process.env.REVIEW_ASR_API_KEY?.trim();

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "服务端还没有配置 REVIEW_ASR_API_KEY，暂时不能转写语音。可以先直接打字。",
      },
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

    let data: { text?: unknown } = {};

    try {
      data = JSON.parse(raw) as { text?: unknown };
    } catch {
      // 上游没有返回 JSON 时按空结果处理
    }

    // SenseVoice 可能带 <|zh|><|NEUTRAL|> 这类标记，去掉后再展示
    const text =
      typeof data.text === "string"
        ? data.text.replace(/<\|[^|]*\|>/g, "").trim()
        : "";

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
