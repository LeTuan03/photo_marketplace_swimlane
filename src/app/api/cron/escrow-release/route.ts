import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { releaseDueEscrows } from "@/lib/commerce";

/**
 * Giải ngân các escrow đã hết hạn giữ 7 ngày (TT4).
 * Gọi định kỳ bằng cron. Bảo vệ bằng CRON_SECRET.
 *   curl "http://localhost:3000/api/cron/escrow-release?secret=..."
 *   hoặc header: x-cron-secret: ...
 */
async function handle(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") ?? req.headers.get("x-cron-secret") ?? "";
  if (secret !== env.cronSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const released = await releaseDueEscrows();
  return NextResponse.json({ ok: true, released, at: new Date().toISOString() });
}

export const GET = handle;
export const POST = handle;
