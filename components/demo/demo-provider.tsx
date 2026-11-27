"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  buildDemoMemoryList,
  buildDemoReviews,
  DEMO_RAW_INPUT,
  DEMO_SETTINGS,
  DEMO_STUDENTS,
} from "@/lib/demo-data";
import { resolveMemoryExpiry } from "@/lib/memory";
import {
  emptyDraft,
  type AppSettings,
  type Memory,
  type MemoryInput,
  type MemoryLifecycleAction,
  type ReviewDraft,
  type ReviewListItem,
  type ReviewStyle,
  type Student,
} from "@/lib/types";

export type StudentStore = {
  save: (id: string | null, input: Omit<Student, "id">) => Promise<Student>;
  remove: (id: string) => Promise<void>;
};

export type MemoryStore = {
  save: (id: string | null, input: MemoryInput) => Promise<Memory>;
  remove: (id: string) => Promise<void>;
  setLifecycle: (
    id: string,
    action: MemoryLifecycleAction,
  ) => Promise<Memory>;
};

export type DemoStage = "idle" | "questions" | "draft";

/** 工作台状态放在 Provider 里，切页面不会丢，刷新才清空 */
export type DemoWorkspaceState = {
  rawInput: string;
  draft: ReviewDraft;
  stage: DemoStage;
  style: ReviewStyle;
};

type DemoContextValue = {
  /** 由服务端传入，避免服务端与浏览器时区不同导致水合不一致 */
  today: string;
  students: Student[];
  memories: Memory[];
  reviews: ReviewListItem[];
  settings: AppSettings;
  studentStore: StudentStore;
  memoryStore: MemoryStore;
  workspace: DemoWorkspaceState;
  setWorkspace: (patch: Partial<DemoWorkspaceState>) => void;
  updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  addDemoReview: (input: {
    date: string;
    style: ReviewStyle;
    finalText: string;
  }) => void;
};

const DemoContext = createContext<DemoContextValue | null>(null);

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 游客演示的全局内存状态。
 * 不写 localStorage、不写 sessionStorage：刷新页面即恢复初始数据。
 */
export function DemoProvider({
  today,
  children,
}: {
  today: string;
  children: React.ReactNode;
}) {
  const [students, setStudents] = useState<Student[]>(DEMO_STUDENTS);
  const [settings, setSettings] = useState<AppSettings>(DEMO_SETTINGS);
  const [memories, setMemories] = useState<Memory[]>(() =>
    buildDemoMemoryList(today),
  );
  const [reviews, setReviews] = useState<ReviewListItem[]>(() =>
    buildDemoReviews(today),
  );
  const [workspace, setWorkspaceState] = useState<DemoWorkspaceState>({
    rawInput: DEMO_RAW_INPUT,
    draft: emptyDraft(),
    stage: "idle",
    style: DEMO_SETTINGS.defaultStyle,
  });

  const setWorkspace = useCallback(
    (patch: Partial<DemoWorkspaceState>) => {
      setWorkspaceState((current) => ({ ...current, ...patch }));
    },
    [],
  );


  const studentStore = useMemo<StudentStore>(
    () => ({
      save: async (id, input) => {
        const next: Student = { id: id ?? createId("demo-student"), ...input };

        setStudents((previous) =>
          id
            ? previous.map((item) => (item.id === id ? next : item))
            : [...previous, next],
        );

        return next;
      },
      remove: async (id) => {
        setStudents((previous) =>
          previous.filter((item) => item.id !== id),
        );
      },
    }),
    [],
  );

  const memoryStore = useMemo<MemoryStore>(
    () => ({
      save: async (id, input) => {
        const stamp = new Date().toISOString();
        const existing = id
          ? memories.find((item) => item.id === id)
          : undefined;
        const {
          lifecycle: inputLifecycle,
          ttlDays,
          expiresAt: inputExpiresAt,
          ...rest
        } = input;
        const lifecycle =
          inputLifecycle ?? existing?.lifecycle ?? "permanent";
        const expiresAt = inputLifecycle
          ? resolveMemoryExpiry({ lifecycle, ttlDays })
          : inputExpiresAt !== undefined
            ? inputExpiresAt
            : existing?.expiresAt ?? null;

        const next: Memory = {
          id: id ?? createId("demo-memory"),
          ...rest,
          status: existing?.status ?? "active",
          lifecycle,
          expiresAt,
          archiveAfter: existing?.archiveAfter ?? null,
          archiveReason: existing?.archiveReason ?? null,
          sourceDate: rest.sourceDate ?? null,
          createdAt: existing?.createdAt ?? stamp,
          updatedAt: stamp,
        };

        setMemories((previous) =>
          id
            ? previous.map((item) => (item.id === id ? next : item))
            : [next, ...previous],
        );

        return next;
      },
      remove: async (id) => {
        setMemories((previous) =>
          previous.filter((item) => item.id !== id),
        );
      },
      setLifecycle: async (id, action) => {
        const existing = memories.find((item) => item.id === id);
        if (!existing) throw new Error("没有找到这条记忆");

        const stamp = new Date().toISOString();
        let next: Memory;

        if (action === "keep_permanent") {
          next = {
            ...existing,
            status: "active",
            lifecycle: "permanent",
            expiresAt: null,
            archiveAfter: null,
            archiveReason: null,
            updatedAt: stamp,
          };
        } else if (action === "extend_7d") {
          next = {
            ...existing,
            status: "active",
            lifecycle: "ephemeral",
            expiresAt: resolveMemoryExpiry({
              lifecycle: "ephemeral",
              ttlDays: 7,
            }),
            archiveAfter: null,
            archiveReason: null,
            updatedAt: stamp,
          };
        } else if (action === "archive") {
          next = {
            ...existing,
            status: "archived",
            archiveAfter: null,
            archiveReason: "手动归档",
            updatedAt: stamp,
          };
        } else {
          next = {
            ...existing,
            status: "active",
            lifecycle: "permanent",
            expiresAt: null,
            archiveAfter: null,
            archiveReason: null,
            updatedAt: stamp,
          };
        }

        setMemories((previous) =>
          previous.map((item) => (item.id === id ? next : item)),
        );

        return next;
      },
    }),
    [memories],
  );

  const settingsRef = useRef(settings);

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      // 用函数式更新避免并发 patch 互相覆盖，同时用 ref 返回最新值
      const next = { ...settingsRef.current, ...patch };
      settingsRef.current = next;
      setSettings((current) => ({ ...current, ...patch }));
      return next;
    },
    [],
  );

  const addDemoReview = useCallback(
    (input: { date: string; style: ReviewStyle; finalText: string }) => {
      setReviews((previous) => {
        const item: ReviewListItem = {
          id: `demo-review-${input.date}`,
          reviewDate: input.date,
          style: input.style,
          finalText: input.finalText,
          questions: 0,
          updatedAt: new Date().toISOString(),
        };

        return [
          item,
          ...previous.filter((entry) => entry.reviewDate !== input.date),
        ];
      });
    },
    [],
  );

  const value = useMemo<DemoContextValue>(
    () => ({
      today,
      students,
      memories,
      reviews,
      settings,
      studentStore,
      memoryStore,
      workspace,
      setWorkspace,
      updateSettings,
      addDemoReview,
    }),
    [
      today,
      students,
      memories,
      reviews,
      settings,
      studentStore,
      memoryStore,
      workspace,
      setWorkspace,
      updateSettings,
      addDemoReview,
    ],
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoContextValue {
  const context = useContext(DemoContext);
  if (!context) {
    throw new Error("useDemo 必须在 DemoProvider 内使用");
  }
  return context;
}
