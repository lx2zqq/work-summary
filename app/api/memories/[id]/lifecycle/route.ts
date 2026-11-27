import { NextResponse } from "next/server";
import {
  firstIssue,
  isValidUuid,
  requireApiSession,
} from "@/lib/api-helpers";
import {
  archiveMemory,
  keepMemory,
  restoreMemory,
} from "@/lib/db/queries";
import { memoryLifecycleActionSchema } from "@/lib/schema";
import type { Memory } from "@/lib/types";

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteParams) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "记忆 ID 不对" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = memoryLifecycleActionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: firstIssue(parsed.error) },
      { status: 400 },
    );
  }

  try {
    let memory: Memory | null;

    switch (parsed.data.action) {
      case "keep_permanent":
        memory = await keepMemory(id, "permanent");
        break;
      case "extend_7d":
        memory = await keepMemory(id, "extend_7d");
        break;
      case "archive":
        memory = await archiveMemory(id);
        break;
      case "restore":
        memory = await restoreMemory(id);
        break;
    }

    if (!memory) {
      return NextResponse.json(
        { error: "没有找到这条记忆" },
        { status: 404 },
      );
    }

    return NextResponse.json({ memory });
  } catch (error) {
    console.error("[memories:lifecycle]", error);
    return NextResponse.json(
      { error: "更新记忆状态失败" },
      { status: 500 },
    );
  }
}
