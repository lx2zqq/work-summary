"use client";

import { Pencil, Plus, Search, Trash2, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { HachiwareMascot } from "@/components/mascots";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { avatarTone } from "@/lib/avatar-tone";
import { formatDateShort } from "@/lib/date";
import type {
  Memory,
  ReviewSnippet,
  Student,
  StudentStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { StudentDetail } from "./student-detail";

const STATUS_OPTIONS: StudentStatus[] = [
  "在读",
  "停课",
  "潜在",
  "已结课",
];

const STATUS_TONE: Record<
  StudentStatus,
  "green" | "amber" | "blue" | "stone"
> = {
  在读: "green",
  停课: "amber",
  潜在: "blue",
  已结课: "stone",
};

type FormState = {
  name: string;
  grade: string;
  subjects: string;
  status: StudentStatus;
  note: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  grade: "",
  subjects: "",
  status: "在读",
  note: "",
};

/** 演示模式用内存实现；生产不传，走接口 */
export type StudentStore = {
  save: (id: string | null, input: Omit<Student, "id">) => Promise<Student>;
  remove: (id: string) => Promise<void>;
};

export function StudentManager({
  initialStudents,
  store,
  memories = [],
  reviews = [],
  demoMode = false,
}: {
  initialStudents: Student[];
  store?: StudentStore;
  memories?: Memory[];
  reviews?: ReviewSnippet[];
  demoMode?: boolean;
}) {
  const [students, setStudents] = useState(initialStudents);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | StudentStatus>(
    "all",
  );
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [detailStudent, setDetailStudent] = useState<Student | null>(null);

  const filtered = useMemo(() => {
    const keyword = query.trim();

    return students.filter((student) => {
      if (statusFilter !== "all" && student.status !== statusFilter) {
        return false;
      }
      if (!keyword) return true;

      return [
        student.name,
        student.grade ?? "",
        student.subjects ?? "",
        student.note ?? "",
      ].some((value) => value.includes(keyword));
    });
  }, [students, query, statusFilter]);

  const filtering = Boolean(query.trim() || statusFilter !== "all");

  function memoriesFor(student: Student): Memory[] {
    return memories.filter(
      (memory) =>
        memory.status === "active" &&
        (memory.studentId === student.id ||
          (!memory.studentId && memory.studentName === student.name)),
    );
  }

  function reviewsFor(student: Student): ReviewSnippet[] {
    return reviews.filter((review) =>
      review.finalText.includes(student.name),
    );
  }

  function openCreate(prefillName = "") {
    setEditing(null);
    setForm({ ...EMPTY_FORM, name: prefillName });
    setOpen(true);
  }

  function openEdit(student: Student) {
    setEditing(student);
    setForm({
      name: student.name,
      grade: student.grade ?? "",
      subjects: student.subjects ?? "",
      status: student.status,
      note: student.note ?? "",
    });
    setOpen(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.name.trim()) {
      toast.error("请填写学生姓名");
      return;
    }

    setSaving(true);

    const payload = {
      name: form.name,
      grade: form.grade || null,
      subjects: form.subjects || null,
      status: form.status,
      note: form.note || null,
    };

    try {
      const student = store
        ? await store.save(editing?.id ?? null, payload)
        : await (async () => {
            const response = await fetch(
              editing ? `/api/students/${editing.id}` : "/api/students",
              {
                method: editing ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              },
            );
            const data = (await response.json().catch(() => ({}))) as {
              error?: string;
              student?: Student;
            };

            if (!response.ok || !data.student) {
              throw new Error(data.error || "保存失败");
            }

            return data.student;
          })();

      setStudents((previous) =>
        editing
          ? previous.map((item) =>
              item.id === student.id ? student : item,
            )
          : [...previous, student],
      );
      setOpen(false);
      if (!editing) {
        setQuery("");
        setStatusFilter("all");
      }
      toast.success(editing ? "已更新学生信息" : "已添加学生");
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
      if (store) {
        await store.remove(deleteTarget.id);
      } else {
        const response = await fetch(`/api/students/${deleteTarget.id}`, {
          method: "DELETE",
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error || "删除失败");
        }
      }

      setStudents((previous) =>
        previous.filter((item) => item.id !== deleteTarget.id),
      );
      if (detailStudent?.id === deleteTarget.id) setDetailStudent(null);
      setDeleteTarget(null);
      toast.success("已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-soft">
          {filtering
            ? `筛选出 ${filtered.length} 位`
            : students.length > 0
              ? `${students.length} 位学生`
              : "还没有学生"}
        </p>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:w-48 sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-soft/60" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索姓名、年级、科目…"
              className="h-9 pl-8 text-xs"
            />
          </div>

          <Select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as "all" | StudentStatus)
            }
            className="h-9 w-28 text-xs"
            aria-label="按状态筛选"
          >
            <option value="all">全部状态</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </Select>

          <Button size="sm" onClick={() => openCreate()}>
            <Plus className="h-4 w-4" />
            添加学生
          </Button>
        </div>
      </div>

      {filtering ? (
        <p className="text-[11px] text-ink-soft">
          {filtered.length === 0 ? "没有匹配的学生" : null}
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setStatusFilter("all");
            }}
            className="ml-2 text-brand-deep underline underline-offset-2"
          >
            清除筛选
          </button>
        </p>
      ) : null}

      {students.length === 0 ? (
        <div className="paper-card border-dashed px-6 py-12 text-center">
          <HachiwareMascot className="mx-auto h-20 w-20" mood="sad" />
          <p className="mt-3 text-sm font-medium text-ink">
            先添加第一位学生吧
          </p>
          <Button className="mt-4" onClick={() => openCreate()}>
            <UserRound className="h-4 w-4" />
            添加学生
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="paper-card px-6 py-12 text-center">
          <p className="text-sm text-ink-soft">没有匹配的学生</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((student) => {
            const studentMemories = memoriesFor(student);
            const studentReviews = reviewsFor(student);
            const lastReviewDate = studentReviews[0]?.reviewDate ?? null;

            return (
              <article
                key={student.id}
                role="button"
                tabIndex={0}
                aria-label={`查看 ${student.name} 的详情`}
                onClick={() => setDetailStudent(student)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setDetailStudent(student);
                  }
                }}
                className="paper-card cursor-pointer p-4 transition-colors hover:border-brand/30"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-medium",
                      avatarTone(student.name),
                    )}
                  >
                    {student.name.slice(0, 1)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold text-ink">
                        {student.name}
                      </h2>
                      <Badge
                        tone={STATUS_TONE[student.status] ?? "stone"}
                      >
                        {student.status}
                      </Badge>
                    </div>

                    {student.grade || student.subjects ? (
                      <p className="mt-0.5 text-xs text-ink-soft">
                        {[student.grade, student.subjects]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-soft">
                      <span>
                        记忆{" "}
                        <span className="font-medium text-ink">
                          {studentMemories.length}
                        </span>{" "}
                        条
                      </span>
                      <span>
                        最近跟进{" "}
                        <span className="font-medium text-ink">
                          {lastReviewDate
                            ? formatDateShort(lastReviewDate)
                            : "暂无"}
                        </span>
                      </span>
                    </div>

                    {student.note ? (
                      <p className="mt-2 line-clamp-1 text-[11px] leading-relaxed text-ink-soft">
                        {student.note}
                      </p>
                    ) : null}
                  </div>

                  <div
                    className="flex shrink-0 items-center gap-0.5"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      title="编辑学生"
                      aria-label={`编辑 ${student.name}`}
                      onClick={() => openEdit(student)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="删除学生"
                      aria-label={`删除 ${student.name}`}
                      onClick={() => setDeleteTarget(student)}
                    >
                      <Trash2 className="h-4 w-4 text-[#a94b42]" />
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={editing ? "编辑学生" : "添加学生"}>
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="student-name">姓名 *</Label>
              <Input
                id="student-name"
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                placeholder="林小满"
                maxLength={20}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="student-grade">年级</Label>
                <Input
                  id="student-grade"
                  value={form.grade}
                  onChange={(event) =>
                    setForm({ ...form, grade: event.target.value })
                  }
                  placeholder="初一"
                  maxLength={20}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="student-status">状态</Label>
                <Select
                  id="student-status"
                  value={form.status}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      status: event.target.value as StudentStatus,
                    })
                  }
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="student-subjects">科目</Label>
              <Input
                id="student-subjects"
                value={form.subjects}
                onChange={(event) =>
                  setForm({ ...form, subjects: event.target.value })
                }
                placeholder="数学、英语"
                maxLength={60}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="student-note">备注</Label>
              <Textarea
                id="student-note"
                value={form.note}
                onChange={(event) =>
                  setForm({ ...form, note: event.target.value })
                }
                placeholder="比如：基础较弱，重点盯错题"
                rows={3}
                maxLength={300}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button type="submit" loading={saving}>
                {editing ? "保存修改" : "添加"}
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
          title="删除学生"
          description={
            deleteTarget
              ? `确定删除「${deleteTarget.name}」吗？历史复盘不会受影响。`
              : undefined
          }
        >
          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setDeleteTarget(null)}
            >
              取消
            </Button>
            <Button
              variant="danger"
              loading={deleting}
              onClick={() => {
                void handleDelete();
              }}
            >
              确认删除
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <StudentDetail
        student={detailStudent}
        open={Boolean(detailStudent)}
        onOpenChange={(next) => {
          if (!next) setDetailStudent(null);
        }}
        memories={detailStudent ? memoriesFor(detailStudent) : []}
        reviews={detailStudent ? reviewsFor(detailStudent) : []}
        demoMode={demoMode}
      />
    </div>
  );
}
