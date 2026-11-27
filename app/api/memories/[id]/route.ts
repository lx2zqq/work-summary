import { NextResponse } from "next/server";
import {
  firstIssue,
  isValidUuid,
  requireApiSession,
} from "@/lib/api-helpers";
import {
  deleteMemory,
  listStudents,
  updateMemory,
} from "@/lib/db/queries";
import {
  resolveMemoryExpiry,
  resolveMemoryStudent,
} from "@/lib/memory";
import { memoryInputSchema } from "@/lib/schema";

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteParams) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "记忆 ID 不对" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = memoryInputSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: firstIssue(parsed.error) },
      { status: 400 },
    );
  }

  try {
    const students = await listStudents();
    const resolved = resolveMemoryStudent(parsed.data, students);

    if (parsed.data.scope === "student" && !resolved.studentName) {
      return NextResponse.json(
        { error: "请选择学生" },
        { status: 400 },
      );
    }

    const lifecycle = parsed.data.lifecycle;

    const memory = await updateMemory(id, {
      scope: parsed.data.scope,
      studentId: resolved.studentId,
      studentName: resolved.studentName,
      category: parsed.data.category,
      content: parsed.data.content,
      importance: parsed.data.importance,
      // 不传 lifecycle 时保留原生命周期，避免编辑内容把阶段性记忆改成长期
      ...(lifecycle
        ? {
            lifecycle,
            expiresAt: resolveMemoryExpiry({
              lifecycle,
              ttlDays: parsed.data.ttlDays,
            }),
          }
        : {}),
    });

    if (!memory) {
      return NextResponse.json({ error: "没有找到这条记忆" }, { status: 404 });
    }

    return NextResponse.json({ memory });
  } catch (error) {
    console.error("[memories:PATCH]", error);
    return NextResponse.json(
      { error: "修改记忆失败" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteParams) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "记忆 ID 不对" }, { status: 400 });
  }

  try {
    const deleted = await deleteMemory(id);
    if (!deleted) {
      return NextResponse.json({ error: "没有找到这条记忆" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[memories:DELETE]", error);
    return NextResponse.json(
      { error: "删除记忆失败" },
      { status: 500 },
    );
  }
}
