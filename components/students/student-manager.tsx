"use client";

import { Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { HachiwareMascot } from "@/components/mascots";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Student, StudentStatus } from "@/lib/types";

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

export function StudentManager({
  initialStudents,
}: {
  initialStudents: Student[];
}) {
  const [students, setStudents] = useState(initialStudents);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState(false);

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

    try {
      const response = await fetch(
        editing ? `/api/students/${editing.id}` : "/api/students",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name,
            grade: form.grade || null,
            subjects: form.subjects || null,
            status: form.status,
            note: form.note || null,
          }),
        },
      );
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        student?: Student;
      };

      if (!response.ok || !data.student) {
        throw new Error(data.error || "保存失败");
      }

      const student = data.student;
      setStudents((previous) =>
        editing
          ? previous.map((item) =>
              item.id === student.id ? student : item,
            )
          : [...previous, student],
      );
      setOpen(false);
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
      const response = await fetch(`/api/students/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "删除失败");
      }

      setStudents((previous) =>
        previous.filter((item) => item.id !== deleteTarget.id),
      );
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
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">
          {students.length > 0
            ? `共 ${students.length} 位学生`
            : "还没有学生"}
        </p>
        <Button onClick={() => openCreate()}>
          <Plus className="h-4 w-4" />
          添加学生
        </Button>
      </div>

      {students.length === 0 ? (
        <div className="paper-card border-dashed px-6 py-12 text-center">
          <HachiwareMascot className="mascot-float mx-auto h-24 w-24" mood="sad" />
          <p className="mt-3 text-sm font-extrabold text-ink">
            先添加林小满吧
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            添加后，AI 会更容易认出她，也能补全年级和科目。
          </p>
          <Button className="mt-4" onClick={() => openCreate("林小满")}>
            <UserRound className="h-4 w-4" />
            添加林小满
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {students.map((student) => (
            <article
              key={student.id}
              className="paper-card p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-soft text-sm font-extrabold text-[#4e7f99] ring-2 ring-sky/60">
                    {student.name.slice(0, 1)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-extrabold text-ink">
                        {student.name}
                      </h2>
                      <Badge
                        tone={STATUS_TONE[student.status] ?? "stone"}
                      >
                        {student.status}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {[student.grade, student.subjects]
                        .filter(Boolean)
                        .join(" · ") || "还没有填写年级/科目"}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(student)}
                    aria-label={`编辑 ${student.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(student)}
                    aria-label={`删除 ${student.name}`}
                  >
                    <Trash2 className="h-4 w-4 text-[#b35454]" />
                  </Button>
                </div>
              </div>
              {student.note ? (
                <p className="mt-3 rounded-2xl bg-cream-deep/60 px-3 py-2 text-xs leading-relaxed text-ink-soft">
                  {student.note}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={editing ? "编辑学生" : "添加学生"}
          description="年级、科目和备注都可以留空，之后随时补。"
        >
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
    </div>
  );
}
