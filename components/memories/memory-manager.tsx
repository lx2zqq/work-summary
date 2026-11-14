"use client";

import { Brain, Pencil, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { UsagiMascot } from "@/components/mascots";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { formatDateCN } from "@/lib/date";
import {
  MEMORY_CATEGORIES,
  type Memory,
  type MemoryCategory,
  type MemoryScope,
  type Student,
} from "@/lib/types";

type Props = {
  initialMemories: Memory[];
  students: Student[];
  memoryEnabled: boolean;
};

type FormState = {
  scope: MemoryScope;
  studentId: string;
  studentName: string;
  category: MemoryCategory;
  content: string;
  importance: "1" | "2" | "3";
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

function importanceLabel(importance: number): string {
  const value = Math.max(1, Math.min(3, importance));
  return `${"●".repeat(value)}${"○".repeat(3 - value)}`;
}

function groupMemories(memories: Memory[]): {
  students: MemoryGroup[];
  general: Memory[];
} {
  const studentMap = new Map<string, MemoryGroup>();
  const general: Memory[] = [];

  for (const memory of memories) {
    if (memory.status !== "active") continue;

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

export function MemoryManager({
  initialMemories,
  students,
  memoryEnabled,
}: Props) {
  const [memories, setMemories] = useState(initialMemories);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Memory | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Memory | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    const keyword = query.trim();
    if (!keyword) return memories;

    return memories.filter((memory) =>
      [memory.content, memory.studentName ?? "", memory.category].some(
        (value) => value.includes(keyword),
      ),
    );
  }, [memories, query]);

  const allGroups = useMemo(() => groupMemories(memories), [memories]);
  const groups = useMemo(() => groupMemories(filtered), [filtered]);
  const activeCount = memories.filter(
    (memory) => memory.status === "active",
  ).length;

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

    setSaving(true);

    try {
      const response = await fetch(
        editing ? `/api/memories/${editing.id}` : "/api/memories",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
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
          }),
        },
      );
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        memory?: Memory;
      };

      if (!response.ok || !data.memory) {
        throw new Error(data.error || "保存失败");
      }

      const memory = data.memory;

      setMemories((previous) =>
        editing
          ? previous.map((item) =>
              item.id === memory.id ? memory : item,
            )
          : [memory, ...previous],
      );
      setOpen(false);
      toast.success(editing ? "记忆已更新" : "记忆已添加");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    setDeleting(true);

    try {
      const response = await fetch(`/api/memories/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "删除失败");
      }

      setMemories((previous) =>
        previous.filter((item) => item.id !== deleteTarget.id),
      );
      setDeleteTarget(null);
      toast.success("记忆已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  }

  function renderMemoryCard(memory: Memory) {
    return (
      <article key={memory.id} className="paper-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="blue">{memory.category}</Badge>
              <span
                className="text-[11px] tracking-[0.2em] text-brand-deep"
                title={`重要度 ${memory.importance}`}
              >
                {importanceLabel(memory.importance)}
              </span>
            </div>
            <p className="mt-2 text-sm font-bold leading-relaxed text-ink">
              {memory.content}
            </p>
            <p className="mt-1 text-[11px] text-ink-soft">
              {memory.sourceDate ? formatDateCN(memory.sourceDate) : "手动添加"}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openEdit(memory)}
            >
              <Pencil className="h-4 w-4" />
              编辑
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteTarget(memory)}
            >
              <Trash2 className="h-4 w-4" />
              删除
            </Button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <div className="space-y-4">
      <section className="paper-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-brand-deep ring-2 ring-brand/40">
              <Brain className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-ink">
                记忆库
              </h2>
              <p className="text-[11px] text-ink-soft">
                共 {activeCount} 条 · 学生 {allGroups.students.length} 人
              </p>
            </div>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            新增记忆
          </Button>
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft/60" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索内容、学生或分类…"
            className="h-10 pl-9 text-xs"
          />
        </div>

        {!memoryEnabled ? (
          <p className="mt-3 rounded-2xl bg-butter-soft px-3 py-2 text-[11px] leading-relaxed text-[#7a5c2a] ring-2 ring-butter/50">
            长期记忆已关闭：不会提取或参考，已有记忆保留。
            <Link href="/settings" className="ml-1 underline">
              去设置
            </Link>
          </p>
        ) : null}
      </section>

      {activeCount === 0 ? (
        <div className="paper-card border-dashed px-6 py-14 text-center">
          <UsagiMascot className="mascot-float mx-auto h-24 w-24" mood="sad" />
          <p className="mt-3 text-sm font-extrabold text-ink">
            还没有长期记忆
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-full border-2 border-cocoa bg-brand px-4 text-sm font-bold text-cocoa shadow-[0_3px_0_#5b463c] transition-all hover:-translate-y-0.5 hover:bg-[#f7b7c8] hover:shadow-[0_4px_0_#5b463c]"
          >
            去写今天的复盘
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="paper-card px-6 py-10 text-center text-sm text-ink-soft">
          没有找到匹配的记忆。
        </div>
      ) : (
        <div className="space-y-4">
          {groups.students.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-extrabold text-ink">
                学生记忆
              </h2>
              {groups.students.map((group) => (
                <div key={group.key} className="space-y-2">
                  <h3 className="flex items-center gap-2 text-xs font-bold text-ink-soft">
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
              <h2 className="text-sm font-extrabold text-ink">
                通用记忆
              </h2>
              {groups.general.map((memory) => renderMemoryCard(memory))}
            </section>
          ) : null}
        </div>
      )}

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

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null);
        }}
      >
        <DialogContent
          title="删除这条记忆？"
          description="删除后不会影响已经生成的历史复盘。"
        >
          <p className="mt-3 rounded-2xl bg-cream-deep/60 px-3 py-2 text-sm leading-relaxed text-ink-soft">
            {deleteTarget?.content}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              取消
            </Button>
            <Button
              variant="danger"
              loading={deleting}
              onClick={() => void handleDelete()}
            >
              删除
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
