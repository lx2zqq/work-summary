"use client";

import {
  Archive,
  Brain,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { UsagiMascot } from "@/components/mascots";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { formatDateCN } from "@/lib/date";
import {
  formatMemoryImportance,
  formatMemoryRemaining,
} from "@/lib/memory";
import {
  MEMORY_CATEGORIES,
  type Memory,
  type MemoryCategory,
  type MemoryInput,
  type MemoryLifecycle,
  type MemoryLifecycleAction,
  type MemoryScope,
  type Student,
} from "@/lib/types";
import { cn } from "@/lib/utils";

/** 演示模式用内存实现；生产不传，走接口 */
export type MemoryStore = {
  save: (id: string | null, input: MemoryInput) => Promise<Memory>;
  remove: (id: string) => Promise<void>;
  setLifecycle: (
    id: string,
    action: MemoryLifecycleAction,
  ) => Promise<Memory>;
};

type Props = {
  initialMemories: Memory[];
  students: Student[];
  memoryEnabled: boolean;
  store?: MemoryStore;
};

type FormState = {
  scope: MemoryScope;
  studentId: string;
  studentName: string;
  category: MemoryCategory;
  content: string;
  importance: "1" | "2" | "3";
  lifecycle: MemoryLifecycle;
  ttlDays: "7" | "14";
};

type MemoryGroup = {
  key: string;
  title: string;
  items: Memory[];
};

const EMPTY_FORM: FormState = {
  scope: "student",
  studentId: "",
  studentName: "",
  category: "其他",
  content: "",
  importance: "2",
  lifecycle: "permanent",
  ttlDays: "7",
};

const SCOPE_OPTIONS = [
  { value: "student" as const, label: "学生" },
  { value: "general" as const, label: "通用" },
];

const IMPORTANCE_OPTIONS = [
  { value: "1" as const, label: "一般" },
  { value: "2" as const, label: "重要" },
  { value: "3" as const, label: "很重要" },
];

const LIFECYCLE_OPTIONS: Array<{
  value: MemoryLifecycle;
  label: string;
}> = [
  { value: "permanent", label: "长期" },
  { value: "ephemeral", label: "阶段性" },
];

const TTL_OPTIONS: Array<{ value: "7" | "14"; label: string }> = [
  { value: "7", label: "7 天" },
  { value: "14", label: "14 天" },
];

type ScopeFilter = "all" | MemoryScope;

const SCOPE_FILTER_OPTIONS: Array<{ value: ScopeFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "student", label: "学生" },
  { value: "general", label: "通用" },
];

function groupMemories(memories: Memory[]): {
  students: MemoryGroup[];
  general: Memory[];
} {
  const studentMap = new Map<string, MemoryGroup>();
  const general: Memory[] = [];

  for (const memory of memories) {
    // 已归档记忆单独放在折叠区，不进主列表
    if (memory.status === "archived") continue;

    if (memory.scope === "general") {
      general.push(memory);
      continue;
    }

    const key =
      memory.studentId ?? `name:${memory.studentName ?? "未关联"}`;
    const title = memory.studentName ?? "未关联学生";
    const group = studentMap.get(key) ?? { key, title, items: [] };

    group.items.push(memory);
    studentMap.set(key, group);
  }

  const sortItems = (items: Memory[]) =>
    items.sort(
      (a, b) =>
        b.importance - a.importance ||
        b.updatedAt.localeCompare(a.updatedAt),
    );

  const students = [...studentMap.values()]
    .map((group) => ({ ...group, items: sortItems(group.items) }))
    .sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));

  return { students, general: sortItems(general) };
}

function lifecycleMessage(action: MemoryLifecycleAction): string {
  switch (action) {
    case "keep_permanent":
      return "已保留为长期记忆";
    case "extend_7d":
      return "已顺延 7 天";
    case "archive":
      return "已归档";
    case "restore":
      return "已恢复为长期记忆";
  }
}

export function MemoryManager({
  initialMemories,
  students,
  memoryEnabled,
  store,
}: Props) {
  const [memories, setMemories] = useState(initialMemories);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [category, setCategory] = useState<"all" | MemoryCategory>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Memory | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Memory | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [lifecycleBusyId, setLifecycleBusyId] = useState<string | null>(
    null,
  );

  const mountedRef = useRef(true);
  const saveLockRef = useRef(false);
  const deleteLockRef = useRef(false);
  const lifecycleLockRef = useRef(false);
  const saveAbortRef = useRef<AbortController | null>(null);
  const deleteAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      saveAbortRef.current?.abort();
      deleteAbortRef.current?.abort();
    };
  }, []);

  // 服务端刷新后同步 props；在渲染期间比较，避免 effect 里 setState
  const [initialSnapshot, setInitialSnapshot] = useState(initialMemories);

  if (initialSnapshot !== initialMemories) {
    setInitialSnapshot(initialMemories);
    setMemories(initialMemories);
  }

  const visibleMemories = useMemo(
    () => memories.filter((memory) => memory.status !== "archived"),
    [memories],
  );

  const archivedMemories = useMemo(
    () =>
      memories
        .filter((memory) => memory.status === "archived")
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [memories],
  );

  // 只展示当前范围里真实存在条目的分类，避免一排空标签
  const scopeMemories = useMemo(
    () =>
      visibleMemories.filter(
        (memory) => scope === "all" || memory.scope === scope,
      ),
    [visibleMemories, scope],
  );

  const availableCategories = useMemo(
    () =>
      MEMORY_CATEGORIES.filter((item) =>
        scopeMemories.some((memory) => memory.category === item),
      ),
    [scopeMemories],
  );

  // 分类被删空时自动退回「全部分类」，避免停留在不存在的筛选上
  const effectiveCategory =
    category !== "all" && availableCategories.includes(category)
      ? category
      : "all";

  const filtered = useMemo(() => {
    const keyword = query.trim();

    return visibleMemories.filter((memory) => {
      if (scope !== "all" && memory.scope !== scope) return false;
      if (
        effectiveCategory !== "all" &&
        memory.category !== effectiveCategory
      ) {
        return false;
      }
      if (!keyword) return true;

      const needle = keyword.toLowerCase();

      return [memory.content, memory.studentName ?? "", memory.category].some(
        (value) => value.toLowerCase().includes(needle),
      );
    });
  }, [visibleMemories, query, scope, effectiveCategory]);

  const filtering =
    scope !== "all" ||
    effectiveCategory !== "all" ||
    Boolean(query.trim());

  function resetFilters() {
    setQuery("");
    setScope("all");
    setCategory("all");
  }

  function chipClass(active: boolean) {
    return cn(
      "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
      active
        ? "bg-brand-soft text-brand-deep ring-1 ring-brand/20"
        : "bg-cream-deep/70 text-ink-soft hover:bg-cream-deep hover:text-ink",
    );
  }

  const allGroups = useMemo(() => groupMemories(memories), [memories]);
  const groups = useMemo(() => groupMemories(filtered), [filtered]);
  const visibleCount = visibleMemories.length;

  function openCreate() {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      scope: students.length > 0 ? "student" : "general",
      studentId: students[0]?.id ?? "",
      studentName: students[0]?.name ?? "",
    });
    setOpen(true);
  }

  function openEdit(memory: Memory) {
    setEditing(memory);
    setForm({
      scope: memory.scope,
      studentId: memory.studentId ?? "",
      studentName: memory.studentName ?? "",
      category: memory.category,
      content: memory.content,
      importance: String(
        memory.importance === 1 || memory.importance === 3
          ? memory.importance
          : 2,
      ) as "1" | "2" | "3",
      lifecycle: memory.lifecycle,
      ttlDays: "7",
    });
    setOpen(true);
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const content = form.content.trim();

    if (!content) {
      toast.error("请填写记忆内容");
      return;
    }

    if (
      form.scope === "student" &&
      !form.studentId &&
      !form.studentName.trim()
    ) {
      toast.error("请选择或填写学生");
      return;
    }

    if (saveLockRef.current) return;
    saveLockRef.current = true;
    setSaving(true);

    // 重复提交时中止旧请求
    saveAbortRef.current?.abort();
    const controller = new AbortController();
    saveAbortRef.current = controller;

    // 编辑时没改记忆周期就不提交，保留原来的有效期
    const lifecycleChanged =
      !editing || form.lifecycle !== editing.lifecycle;

    const payload = {
      scope: form.scope,
      studentId:
        form.scope === "student" ? form.studentId || null : null,
      studentName:
        form.scope === "student"
          ? form.studentName.trim() || null
          : null,
      category: form.category,
      content,
      importance: Number(form.importance),
      ...(lifecycleChanged
        ? {
            lifecycle: form.lifecycle,
            ...(form.lifecycle === "ephemeral"
              ? { ttlDays: Number(form.ttlDays) }
              : {}),
          }
        : {}),
    };

    try {
      const memory = store
        ? await store.save(editing?.id ?? null, payload)
        : await (async () => {
            const response = await fetch(
              editing ? `/api/memories/${editing.id}` : "/api/memories",
              {
                method: editing ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                signal: controller.signal,
              },
            );
            const data = (await response.json().catch(() => ({}))) as {
              error?: string;
              memory?: Memory;
            };

            if (!response.ok || !data.memory) {
              throw new Error(data.error || "保存失败");
            }

            return data.memory;
          })();

      if (!mountedRef.current || saveAbortRef.current !== controller) return;

      setMemories((previous) =>
        editing
          ? previous.map((item) =>
              item.id === memory.id ? memory : item,
            )
          : [memory, ...previous],
      );
      setOpen(false);
      if (!editing) resetFilters();
      toast.success(editing ? "记忆已更新" : "记忆已添加");
    } catch (error) {
      if (controller.signal.aborted) return;
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      if (saveAbortRef.current === controller) {
        saveAbortRef.current = null;
        saveLockRef.current = false;
        if (mountedRef.current) setSaving(false);
      }
    }
  }

  async function handleDelete() {
    const target = deleteTarget;
    if (!target || deleteLockRef.current) return;

    deleteLockRef.current = true;
    setDeleting(true);

    deleteAbortRef.current?.abort();
    const controller = new AbortController();
    deleteAbortRef.current = controller;

    try {
      if (store) {
        await store.remove(target.id);
      } else {
        const response = await fetch(`/api/memories/${target.id}`, {
          method: "DELETE",
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error || "删除失败");
        }
      }

      if (!mountedRef.current || deleteAbortRef.current !== controller) {
        return;
      }

      setMemories((previous) =>
        previous.filter((item) => item.id !== target.id),
      );
      setDeleteTarget(null);
      toast.success("记忆已删除");
    } catch (error) {
      if (controller.signal.aborted) return;
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      if (deleteAbortRef.current === controller) {
        deleteAbortRef.current = null;
        deleteLockRef.current = false;
        if (mountedRef.current) setDeleting(false);
      }
    }
  }

  async function handleLifecycle(
    memory: Memory,
    action: MemoryLifecycleAction,
  ) {
    if (lifecycleLockRef.current) return;

    lifecycleLockRef.current = true;
    setLifecycleBusyId(memory.id);

    try {
      let updated: Memory;

      if (store) {
        updated = await store.setLifecycle(memory.id, action);
      } else {
        const response = await fetch(
          `/api/memories/${memory.id}/lifecycle`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action }),
          },
        );
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          memory?: Memory;
        };

        if (!response.ok || !data.memory) {
          throw new Error(data.error || "操作失败");
        }

        updated = data.memory;
      }

      if (!mountedRef.current) return;

      setMemories((previous) =>
        previous.map((item) =>
          item.id === updated.id ? updated : item,
        ),
      );
      toast.success(lifecycleMessage(action));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      lifecycleLockRef.current = false;
      if (mountedRef.current) setLifecycleBusyId(null);
    }
  }

  const lifecycleBusy = lifecycleBusyId !== null;

  function renderMemoryCard(memory: Memory) {
    const importance = formatMemoryImportance(memory.importance);
    const pending = memory.status === "pending_archive";
    const ephemeral = memory.lifecycle === "ephemeral";
    const remaining = formatMemoryRemaining(memory.expiresAt);

    return (
      <article key={memory.id} className="paper-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="blue">{memory.category}</Badge>
              {pending ? <Badge tone="amber">待归档</Badge> : null}
              {!pending && ephemeral ? (
                <span className="text-[11px] text-ink-soft">
                  阶段性{remaining ? ` · ${remaining}` : ""}
                </span>
              ) : null}
              <span
                className="flex items-center gap-1 text-[11px] text-ink-soft"
                title={`重要度：${importance.label}`}
                aria-label={`重要度：${importance.label}`}
              >
                <span className="tracking-[0.2em] text-brand-deep">
                  {importance.dots}
                </span>
                {importance.label}
              </span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-ink">
              {memory.content}
            </p>
            {pending ? (
              <p className="mt-1 text-[11px] text-warning-deep">
                {memory.archiveReason ?? "已过建议时效"}
                {memory.archiveAfter
                  ? ` · ${formatMemoryRemaining(memory.archiveAfter)}后归档`
                  : ""}
              </p>
            ) : null}
            <p className="mt-1 text-[11px] text-ink-soft">
              {memory.sourceDate ? formatDateCN(memory.sourceDate) : "手动添加"}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            {pending ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void handleLifecycle(memory, "keep_permanent");
                  }}
                  loading={lifecycleBusyId === memory.id}
                  disabled={lifecycleBusy}
                >
                  保留
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void handleLifecycle(memory, "archive");
                  }}
                  disabled={lifecycleBusy}
                >
                  归档
                </Button>
              </>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              title="编辑这条记忆"
              aria-label="编辑这条记忆"
              onClick={() => openEdit(memory)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="删除这条记忆"
              aria-label="删除这条记忆"
              onClick={() => setDeleteTarget(memory)}
            >
              <Trash2 className="h-4 w-4 text-danger" />
            </Button>
          </div>
        </div>
      </article>
    );
  }

  function renderArchivedCard(memory: Memory) {
    return (
      <article
        key={memory.id}
        className="rounded-xl border border-line/70 bg-cream/60 p-3"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="stone">{memory.category}</Badge>
              <span className="text-[11px] text-ink-soft">
                {memory.studentName ?? "通用"}
              </span>
              {memory.archiveReason ? (
                <span className="text-[11px] text-ink-soft">
                  {memory.archiveReason}
                </span>
              ) : null}
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
              {memory.content}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void handleLifecycle(memory, "restore");
              }}
              loading={lifecycleBusyId === memory.id}
              disabled={lifecycleBusy}
            >
              恢复
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="永久删除这条记忆"
              aria-label="永久删除这条记忆"
              onClick={() => setDeleteTarget(memory)}
            >
              <Trash2 className="h-4 w-4 text-danger" />
            </Button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <div className="space-y-4">
      <section className="paper-card p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand-deep">
              <Brain className="h-3.5 w-3.5" />
            </div>
            <h2 className="text-sm font-semibold text-ink">记忆库</h2>
            <span className="text-[11px] text-ink-soft">
              共 {visibleCount} 条 · 学生 {allGroups.students.length} 人
              {archivedMemories.length > 0
                ? ` · 已归档 ${archivedMemories.length}`
                : ""}
            </span>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            新增记忆
          </Button>
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput
            value={query}
            onValueChange={setQuery}
            placeholder="搜索内容、学生或分类…"
            className="sm:w-52 sm:shrink-0"
          />

          <Segmented<ScopeFilter>
            options={SCOPE_FILTER_OPTIONS}
            value={scope}
            onChange={setScope}
            ariaLabel="记忆范围"
            className="shrink-0 [&>button]:flex-1 [&>button]:px-2.5 [&>button]:text-xs sm:[&>button]:flex-none"
          />

          {availableCategories.length > 0 ? (
            <>
              <span className="hidden h-5 w-px shrink-0 bg-line sm:block" />
              <div className="relative min-w-0 flex-1">
                <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 py-0.5">
                  <button
                    type="button"
                    aria-pressed={effectiveCategory === "all"}
                    onClick={() => setCategory("all")}
                    className={chipClass(effectiveCategory === "all")}
                  >
                    全部分类
                  </button>

                  {availableCategories.map((item) => {
                    const active = effectiveCategory === item;

                    return (
                      <button
                        key={item}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setCategory(item)}
                        className={chipClass(active)}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-paper to-transparent sm:hidden"
                />
              </div>
            </>
          ) : null}
        </div>

        {filtering ? (
          <p className="mt-2 text-[11px] text-ink-soft">
            筛选出 <span className="text-ink">{filtered.length}</span> 条
            <button
              type="button"
              onClick={resetFilters}
              className="ml-2 text-brand-deep underline underline-offset-2"
            >
              清除筛选
            </button>
          </p>
        ) : null}

        {!memoryEnabled ? (
          <p className="mt-3 rounded-lg bg-butter-soft px-3 py-2 text-[11px] leading-relaxed text-warning-deep ring-1 ring-butter/50">
            长期记忆已关闭：不会提取或参考，已有记忆保留。
            <Link href="/settings" className="ml-1 underline">
              去设置
            </Link>
          </p>
        ) : null}
      </section>

      {visibleCount === 0 ? (
        <div className="paper-card border-dashed px-6 py-14 text-center">
          <UsagiMascot className="mx-auto h-20 w-20" mood="sad" />
          <p className="mt-3 text-sm font-medium text-ink">还没有记忆</p>
          <Link
            href="/"
            className="mt-4 inline-flex h-10 items-center rounded-lg bg-brand-deep px-4 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
          >
            去写今天的复盘
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="paper-card px-6 py-10 text-center">
          <p className="text-sm text-ink-soft">没有匹配的记忆</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={resetFilters}
          >
            清除筛选
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.students.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-ink">学生记忆</h2>
              {groups.students.map((group) => (
                <div key={group.key} className="space-y-2">
                  <h3 className="flex items-center gap-2 text-xs font-medium text-ink-soft">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-deep" />
                    {group.title}
                    <span className="text-[11px] font-normal">
                      · {group.items.length} 条
                    </span>
                  </h3>
                  {group.items.map((memory) => renderMemoryCard(memory))}
                </div>
              ))}
            </section>
          ) : null}

          {groups.general.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-ink">通用记忆</h2>
              {groups.general.map((memory) => renderMemoryCard(memory))}
            </section>
          ) : null}
        </div>
      )}

      {archivedMemories.length > 0 ? (
        <section className="paper-card p-3 sm:p-4">
          <button
            type="button"
            onClick={() => setShowArchived((value) => !value)}
            className="flex w-full items-center justify-between gap-2 text-left"
            aria-expanded={showArchived}
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Archive className="h-4 w-4 text-ink-soft" />
              已归档
              <span className="text-[11px] font-normal text-ink-soft">
                （{archivedMemories.length}）
              </span>
            </span>
            {showArchived ? (
              <ChevronDown className="h-4 w-4 text-ink-soft" />
            ) : (
              <ChevronRight className="h-4 w-4 text-ink-soft" />
            )}
          </button>

          {showArchived ? (
            <div className="mt-3 space-y-2">
              {archivedMemories.map((memory) =>
                renderArchivedCard(memory),
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={editing ? "编辑记忆" : "新增记忆"}>
          <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
            <div>
              <Label>类型</Label>
              <Segmented<MemoryScope>
                options={SCOPE_OPTIONS}
                value={form.scope}
                onChange={(scope) =>
                  setForm((current) => ({ ...current, scope }))
                }
                className="mt-1.5 w-full [&>button]:flex-1"
                ariaLabel="记忆类型"
              />
            </div>

            {form.scope === "student" ? (
              <div className="space-y-2">
                <Label>学生</Label>
                <Select
                  value={form.studentId || "__manual__"}
                  onChange={(event) => {
                    const value = event.target.value;

                    if (value === "__manual__") {
                      setForm((current) => ({
                        ...current,
                        studentId: "",
                        studentName: current.studentName || "",
                      }));
                      return;
                    }

                    const student = students.find(
                      (item) => item.id === value,
                    );
                    setForm((current) => ({
                      ...current,
                      studentId: value,
                      studentName:
                        student?.name ?? current.studentName,
                    }));
                  }}
                >
                  <option value="__manual__">手动填写姓名</option>
                  {students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.name}
                    </option>
                  ))}
                </Select>
                {!form.studentId ? (
                  <Input
                    value={form.studentName}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        studentName: event.target.value,
                      }))
                    }
                    placeholder="学生姓名"
                    maxLength={20}
                    className="h-10 text-sm"
                  />
                ) : null}
              </div>
            ) : null}

            <div>
              <Label>分类</Label>
              <Select
                value={form.category}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    category: event.target.value as MemoryCategory,
                  }))
                }
                className="mt-1.5"
              >
                {MEMORY_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label>内容</Label>
              <Textarea
                value={form.content}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    content: event.target.value,
                  }))
                }
                placeholder="例如：陈一鸣的数学试听课已报名，家长已交费。"
                maxLength={300}
                className="mt-1.5 min-h-[90px] text-sm"
              />
              <p className="mt-1 text-right text-[11px] text-ink-soft">
                {form.content.length} / 300
              </p>
            </div>

            <div>
              <Label>重要度</Label>
              <Segmented<"1" | "2" | "3">
                options={IMPORTANCE_OPTIONS}
                value={form.importance}
                onChange={(importance) =>
                  setForm((current) => ({ ...current, importance }))
                }
                className="mt-1.5 w-full [&>button]:flex-1"
                ariaLabel="重要度"
              />
            </div>

            <div>
              <Label>记忆周期</Label>
              <Segmented<MemoryLifecycle>
                options={LIFECYCLE_OPTIONS}
                value={form.lifecycle}
                onChange={(lifecycle) =>
                  setForm((current) => ({ ...current, lifecycle }))
                }
                className="mt-1.5 w-full [&>button]:flex-1"
                ariaLabel="记忆周期"
              />
              {form.lifecycle === "ephemeral" ? (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[11px] text-ink-soft">有效期</span>
                  <Segmented<"7" | "14">
                    options={TTL_OPTIONS}
                    value={form.ttlDays}
                    onChange={(ttlDays) =>
                      setForm((current) => ({ ...current, ttlDays }))
                    }
                    ariaLabel="有效天数"
                  />
                </div>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={saving}
              >
                取消
              </Button>
              <Button type="submit" loading={saving}>
                保存
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null);
        }}
        title="删除这条记忆？"
        description="删除后不会影响已经生成的历史复盘。"
        confirmLabel="删除"
        loading={deleting}
        onConfirm={() => void handleDelete()}
      >
        <p className="rounded-lg bg-cream-deep/60 px-3 py-2 text-sm leading-relaxed text-ink-soft">
          {deleteTarget?.content}
        </p>
      </ConfirmDialog>
    </div>
  );
}
