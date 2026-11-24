import { NextResponse } from "next/server";
import {
  firstIssue,
  isValidUuid,
  requireApiSession,
} from "@/lib/api-helpers";
import { deleteStudent, updateStudent } from "@/lib/db/queries";
import { studentInputSchema } from "@/lib/schema";

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteParams) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "学生 ID 不对" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = studentInputSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: firstIssue(parsed.error) },
      { status: 400 },
    );
  }

  try {
    const student = await updateStudent(id, parsed.data);
    if (!student) {
      return NextResponse.json({ error: "没有找到这个学生" }, { status: 404 });
    }
    return NextResponse.json({ student });
  } catch (error) {
    console.error("[students:PATCH]", error);
    return NextResponse.json({ error: "修改学生失败" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteParams) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "学生 ID 不对" }, { status: 400 });
  }

  try {
    const deleted = await deleteStudent(id);
    if (!deleted) {
      return NextResponse.json({ error: "没有找到这个学生" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[students:DELETE]", error);
    return NextResponse.json({ error: "删除学生失败" }, { status: 500 });
  }
}
