import { NextResponse } from "next/server";
import { firstIssue, requireApiSession } from "@/lib/api-helpers";
import { createStudent, listStudents } from "@/lib/db/queries";
import { studentInputSchema } from "@/lib/schema";

export async function GET() {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  try {
    const students = await listStudents();
    return NextResponse.json({ students });
  } catch (error) {
    console.error("[students:GET]", error);
    return NextResponse.json(
      { error: "读取学生名单失败，请检查数据库" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const parsed = studentInputSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: firstIssue(parsed.error) },
      { status: 400 },
    );
  }

  try {
    const student = await createStudent(parsed.data);
    return NextResponse.json({ student }, { status: 201 });
  } catch (error) {
    console.error("[students:POST]", error);
    return NextResponse.json({ error: "添加学生失败" }, { status: 500 });
  }
}
