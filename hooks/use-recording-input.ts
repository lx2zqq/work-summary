"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ASR_SAMPLE_RATE,
  downsample,
  encodeWav16kMono,
  mergeChunks,
} from "@/lib/audio/wav";

type AudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

type Options = {
  onAppend: (text: string) => void;
  maxSeconds?: number;
};

const DEFAULT_MAX_SECONDS = 60;
// Vercel 请求体上限 4.5MB，留一点余量
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const TOGGLE_LOCK_MS = 600;

const START_ERROR_MESSAGES: Record<string, string> = {
  NotAllowedError: "没有麦克风权限，请在微信或浏览器设置里允许后重试。",
  NotFoundError: "没有找到麦克风，请检查设备后重试。",
  NotReadableError: "麦克风被其他应用占用了，请关闭后重试。",
  SecurityError: "当前页面不允许使用麦克风，请确认是 HTTPS 地址。",
};

function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;

  const audioWindow = window as AudioWindow;
  return window.AudioContext ?? audioWindow.webkitAudioContext ?? null;
}

function getSupportedSnapshot(): boolean {
  if (typeof window === "undefined") return false;

  return Boolean(
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
      getAudioContextConstructor(),
  );
}

function getServerSnapshot(): boolean {
  return false;
}

function subscribe() {
  return () => {};
}

function mapStartError(error: unknown): string {
  if (error instanceof DOMException) {
    return (
      START_ERROR_MESSAGES[error.name] ??
      "录音启动失败，请重新试一次。"
    );
  }

  return "录音启动失败，请重新试一次。";
}

export function useRecordingInput({
  onAppend,
  maxSeconds = DEFAULT_MAX_SECONDS,
}: Options) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const supported = useSyncExternalStore(
    subscribe,
    getSupportedSnapshot,
    getServerSnapshot,
  );

  const onAppendRef = useRef(onAppend);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef(ASR_SAMPLE_RATE);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);
  const startingRef = useRef(false);
  const sessionIdRef = useRef(0);
  const startedAtRef = useRef(0);
  const lastToggleRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const maxSecondsRef = useRef(maxSeconds);

  // 用 ref 保存最新回调，避免录音过程中父组件重渲染导致闭包过期
  useEffect(() => {
    onAppendRef.current = onAppend;
  }, [onAppend]);

  useEffect(() => {
    maxSecondsRef.current = maxSeconds;
  }, [maxSeconds]);

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
  }, []);

  const releaseAudio = useCallback(() => {
    clearTimers();

    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (silentGainRef.current) {
      silentGainRef.current.disconnect();
      silentGainRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (contextRef.current) {
      const context = contextRef.current;
      contextRef.current = null;
      void context.close().catch(() => {});
    }
  }, [clearTimers]);

  const cancelRecording = useCallback(() => {
    if (!activeRef.current) return;

    activeRef.current = false;
    sessionIdRef.current += 1;
    startingRef.current = false;
    setRecording(false);
    setSeconds(0);
    chunksRef.current = [];
    releaseAudio();
  }, [releaseAudio]);

  const transcribe = useCallback(async (blob: Blob) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setTranscribing(true);
    setError(null);

    try {
      const form = new FormData();
      form.append("file", blob, "voice.wav");

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => ({}))) as {
        text?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "语音转写失败，请重试。");
      }

      const text = (data.text ?? "").trim();

      if (!text) {
        setError("没有识别出内容，请靠近麦克风再说一次。");
        return;
      }

      onAppendRef.current(text);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        return;
      }

      setError(
        caught instanceof Error
          ? caught.message
          : "语音转写失败，请检查网络后重试。",
      );
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setTranscribing(false);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (!activeRef.current) return;

    activeRef.current = false;
    sessionIdRef.current += 1;
    startingRef.current = false;
    setRecording(false);
    setSeconds(0);

    const chunks = chunksRef.current;
    const sampleRate = sampleRateRef.current;
    chunksRef.current = [];
    releaseAudio();

    const merged = mergeChunks(chunks);

    if (merged.length === 0) {
      setError("没有录到声音，请靠近麦克风再试一次。");
      return;
    }

    const wav = encodeWav16kMono(downsample(merged, sampleRate));

    if (wav.size > MAX_UPLOAD_BYTES) {
      setError("录音太长了，请控制在 60 秒以内。");
      return;
    }

    void transcribe(wav);
  }, [releaseAudio, transcribe]);

  const startRecording = useCallback(async () => {
    if (startingRef.current || activeRef.current) return;

    const AudioContextConstructor = getAudioContextConstructor();

    if (!AudioContextConstructor || !navigator.mediaDevices?.getUserMedia) {
      setError("当前浏览器不支持录音，请直接打字。");
      return;
    }

    startingRef.current = true;
    setError(null);

    // 必须在用户手势里同步创建并恢复 AudioContext，
    // 否则部分 WebView 会一直停在 suspended，录不到任何数据
    const context = new AudioContextConstructor();
    void context.resume().catch(() => {});
    contextRef.current = context;

    const sessionId = sessionIdRef.current + 1;
    sessionIdRef.current = sessionId;
    activeRef.current = true;
    chunksRef.current = [];
    sampleRateRef.current = context.sampleRate;

    try {
      let stream: MediaStream;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
      } catch (caught) {
        // 个别旧版 WebView 不认识音频约束，退回最简单的 audio: true
        const canRetry =
          caught instanceof DOMException &&
          (caught.name === "OverconstrainedError" ||
            caught.name === "TypeError");

        if (!canRetry) throw caught;

        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      if (!activeRef.current || sessionIdRef.current !== sessionId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      stream.getAudioTracks().forEach((track) => {
        track.addEventListener("ended", () => {
          if (activeRef.current && sessionIdRef.current === sessionId) {
            cancelRecording();
            setError("录音被系统中断了，请重新点击语音输入。");
          }
        });
      });

      // 拿到麦克风后再尝试恢复一次，避免部分 WebView 仍在 suspended
      if (context.state === "suspended") {
        void context.resume().catch(() => {});
      }

      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const silentGain = context.createGain();
      silentGain.gain.value = 0;

      processor.onaudioprocess = (event) => {
        if (!activeRef.current || sessionIdRef.current !== sessionId) return;

        // 复制一份，事件结束后底层 buffer 会被复用
        chunksRef.current.push(
          new Float32Array(event.inputBuffer.getChannelData(0)),
        );
      };

      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(context.destination);

      sourceRef.current = source;
      processorRef.current = processor;
      silentGainRef.current = silentGain;

      startedAtRef.current = Date.now();
      setSeconds(0);
      setRecording(true);

      timerRef.current = setInterval(() => {
        const elapsed = Math.floor(
          (Date.now() - startedAtRef.current) / 1000,
        );
        setSeconds(elapsed);
      }, 500);

      autoStopRef.current = setTimeout(() => {
        // 到达上限自动停止并转写，避免文件超过请求体限制
        stopRecording();
      }, maxSecondsRef.current * 1000);
    } catch (caught) {
      activeRef.current = false;
      sessionIdRef.current += 1;
      releaseAudio();
      setRecording(false);
      setError(mapStartError(caught));
    } finally {
      startingRef.current = false;
    }
  }, [cancelRecording, releaseAudio, stopRecording]);

  const toggle = useCallback(() => {
    if (transcribing) return;

    // 微信等 WebView 可能一次点击触发两次事件，这里做节流，
    // 避免刚启动就被第二次事件停掉
    const now = Date.now();

    if (now - lastToggleRef.current < TOGGLE_LOCK_MS) return;
    lastToggleRef.current = now;

    if (activeRef.current) {
      stopRecording();
      return;
    }

    void startRecording();
  }, [transcribing, startRecording, stopRecording]);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      sessionIdRef.current += 1;
      startingRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
      chunksRef.current = [];
      releaseAudio();
    };
  }, [releaseAudio]);

  return {
    supported,
    recording,
    transcribing,
    seconds,
    error,
    toggle,
    stop: stopRecording,
  };
}
