import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CLIENT_EVENTS,
  eventPropertiesSchema,
  trackEvent,
} from "@/lib/analytics/events";
import { requireApiSession } from "@/lib/api-helpers";
import { isoDateSchema } from "@/lib/schema";

const bodySchema = z.object({
  event: z.enum(CLIENT_EVENTS),
  reviewDate: isoDateSchema,
  properties: eventPropertiesSchema.default({}),
});

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "事件参数不对" }, { status: 400 });
  }

  try {
    await trackEvent({
      event: parsed.data.event,
      reviewDate: parsed.data.reviewDate,
      properties: parsed.data.properties,
    });
  } catch (error) {
    // 埋点失败不影响前端主流程
    console.error("[events:POST]", error);
  }

  return NextResponse.json({ ok: true });
}
