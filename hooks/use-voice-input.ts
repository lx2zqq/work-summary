"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

// 浏览器 Web Speech API 的类型目前没有统一进入 TypeScript 的 DOM 类型，这里做最小声明
type SpeechAlternative = {
  transcript: string;
};

type SpeechResult = {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechAlternative;
};

type SpeechResultList = {
  readonly length: number;
  [index: number]: SpeechResult;
};

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: SpeechResultList;
};

type SpeechRecognitionErrorEventLike = Event & {
  error: string;
  message?: string;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "没有麦克风权限，请在浏览器设置里允许后重试。",
  "service-not-allowed":
    "当前浏览器不允许语音识别，请换 Chrome、Safari 或 Edge。",
  "audio-capture": "没有找到麦克风，请检查设备后重试。",
  network: "语音识别服务连接失败，请检查网络后重试。",
  "no-speech": "没有听到声音，请靠近麦克风再试一次。",
  "language-not-supported": "当前浏览器不支持中文语音识别。",
};

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;

  const speechWindow = window as SpeechWindow;
  return (
    speechWindow.SpeechRecognition ??
    speechWindow.webkitSpeechRecognition ??
    null
  );
}

// 语音能力在页面生命周期内不会变化，用 useSyncExternalStore 避免 SSR 与 hydration 不一致
function subscribe() {
  return () => {};
}

function getSupportedSnapshot() {
  return getRecognitionConstructor() !== null;
}

function getServerSnapshot() {
  return false;
}

type Options = {
  onAppend: (text: string) => void;
  lang?: string;
};

export function useVoiceInput({ onAppend, lang = "zh-CN" }: Options) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const supported = useSyncExternalStore(
    subscribe,
    getSupportedSnapshot,
    getServerSnapshot,
  );

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const activeRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionStartedAtRef = useRef(0);
  const sessionIdRef = useRef(0);
  const receivedResultRef = useRef(false);
  const onAppendRef = useRef(onAppend);

  // 用 ref 保存最新回调，避免识别过程中用户继续打字时追加到旧文本
  useEffect(() => {
    onAppendRef.current = onAppend;
  }, [onAppend]);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    activeRef.current = false;
    // 让旧识别器的 onend/onresult 回调失效，避免快速“停止后立即开始”时旧实例复活
    sessionIdRef.current += 1;
    clearRestartTimer();
    setListening(false);
    setInterim("");

    const recognition = recognitionRef.current;
    recognitionRef.current = null;

    if (recognition) {
      try {
        recognition.stop();
      } catch {
        // 识别已经结束时 stop 可能抛错，忽略即可
      }
    }
  }, [clearRestartTimer]);

  const startRecognition = useCallback(() => {
    const Recognition = getRecognitionConstructor();

    if (!Recognition) {
      setError("当前浏览器不支持语音输入，请换 Chrome、Safari 或 Edge。");
      return;
    }

    if (!window.isSecureContext) {
      setError("语音输入需要 HTTPS 或 localhost 环境。");
      return;
    }

    clearRestartTimer();
    setError(null);
    setInterim("");
    receivedResultRef.current = false;

    const sessionId = sessionIdRef.current + 1;
    sessionIdRef.current = sessionId;

    const recognition = new Recognition();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      if (!activeRef.current || sessionIdRef.current !== sessionId) return;
      sessionStartedAtRef.current = Date.now();
      setListening(true);
    };

    recognition.onresult = (event) => {
      if (!activeRef.current || sessionIdRef.current !== sessionId) return;

      const finalParts: string[] = [];
      let interimText = "";

      for (
        let index = event.resultIndex;
        index < event.results.length;
        index += 1
      ) {
        const result = event.results[index];
        const transcript = result[0]?.transcript ?? "";

        if (result.isFinal) {
          if (transcript.trim()) finalParts.push(transcript.trim());
        } else {
          interimText += transcript;
        }
      }

      if (finalParts.length > 0 || interimText.trim()) {
        receivedResultRef.current = true;
      }

      // 一次事件里可能有多个已确定的分句，用换行分开，避免粘成一句
      if (finalParts.length > 0) {
        onAppendRef.current(finalParts.join("\n"));
      }

      setInterim(interimText.trim());
    };

    recognition.onerror = (event) => {
      if (sessionIdRef.current !== sessionId) return;
      if (event.error === "aborted") return;

      activeRef.current = false;
      setListening(false);
      setInterim("");
      setError(
        ERROR_MESSAGES[event.error] ?? "语音识别出错了，请重新试一次。",
      );
    };

    recognition.onend = () => {
      if (sessionIdRef.current !== sessionId) return;

      setInterim("");

      if (!activeRef.current) {
        setListening(false);
        return;
      }

      // 手机端和部分浏览器会在停顿后自动结束，用户没有点停止时自动续听。
      // 如果这一轮刚启动就结束且完全没有识别结果，说明没有收到有效语音，
      // 不再自动重试，避免死循环。
      const sessionDuration = Date.now() - sessionStartedAtRef.current;

      if (sessionDuration < 900 && !receivedResultRef.current) {
        activeRef.current = false;
        setListening(false);
        setError("没有听到声音，请靠近麦克风再试一次。");
        return;
      }

      restartTimerRef.current = setTimeout(() => {
        if (!activeRef.current || sessionIdRef.current !== sessionId) return;

        try {
          recognition.start();
        } catch {
          activeRef.current = false;
          setListening(false);
          setError("语音识别已中断，请重新点击语音输入。");
        }
      }, 320);
    };

    recognitionRef.current = recognition;
    activeRef.current = true;

    try {
      recognition.start();
      // 不等 onstart，先让按钮立即进入“停止”状态，避免重复点击
      setListening(true);
    } catch {
      activeRef.current = false;
      setListening(false);
      setError("语音输入启动失败，请重新试一次。");
    }
  }, [clearRestartTimer, lang]);

  const toggle = useCallback(() => {
    if (activeRef.current || listening) {
      stop();
    } else {
      startRecognition();
    }
  }, [listening, startRecognition, stop]);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      sessionIdRef.current += 1;
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
      }

      const recognition = recognitionRef.current;
      recognitionRef.current = null;

      if (recognition) {
        try {
          recognition.abort();
        } catch {
          // 页面卸载时忽略识别器已经失效的异常
        }
      }
    };
  }, []);

  return { supported, listening, interim, error, toggle, stop };
}
