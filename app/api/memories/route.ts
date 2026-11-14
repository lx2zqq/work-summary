import { NextResponse } from "next/server";
import { firstIssue, requireApiSession } from "@/lib/api-helpers";
import {
  createMemory,
  listMemories,
  listStudents,
} from "@/lib/db/queries";
import { resolveMemoryStudent } from "@/lib/memory";
import { memoryInputSchema } from "@/lib/schema";

export async function GET() {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  try {
    const memories = await listMemories();
    return NextResponse.json({ memories });
  } catch (error) {
    console.error("[memories:GET]", error);
    return NextResponse.json(
      { error: "读取记忆失败" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

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

    const memory = await createMemory({
      scope: parsed.data.scope,
      studentId: resolved.studentId,
      studentName: resolved.studentName,
      category: parsed.data.category,
      content: parsed.data.content,
      importance: parsed.data.importance,
      sourceDate: null,
    });

    return NextResponse.json({ memory });
  } catch (error) {
    console.error("[memories:POST]", error);
    return NextResponse.json(
      { error: "保存记忆失败" },
      { status: 500 },
    );
  }
}
