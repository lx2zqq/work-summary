import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CLIENT_EVENTS,
  eventPropertiesSchema,
  trackEvent,
} from "@/lib/analytics/events";
import { requireApiSession } from "@/lib/api-helpers";

const bodySchema = z.object({
  event: z.enum(CLIENT_EVENTS),
  reviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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

  await trackEvent({
    event: parsed.data.event,
    reviewDate: parsed.data.reviewDate,
    properties: parsed.data.properties,
  });

  return NextResponse.json({ ok: true });
}
