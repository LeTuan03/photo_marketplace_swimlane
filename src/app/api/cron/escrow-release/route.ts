import { type NextRequest, NextResponse } from "next/server";
import { isValidCronSecret } from "@/lib/cron";
import { releaseDueEscrows } from "@/lib/commerce";

/**
 * Giải ngân các escrow đã hết hạn giữ 7 ngày (TT4).
 * Gọi định kỳ bằng cron. Bảo vệ bằng CRON_SECRET (ưu tiên header x-cron-secret).
 *   curl -H "x-cron-secret: ..." "http://localhost:3000/api/cron/escrow-release"
 */
async function handle(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret") ?? "";
  if (!isValidCronSecret(secret)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const released = await releaseDueEscrows();
  return NextResponse.json({ ok: true, released, at: new Date().toISOString() });
}

export const GET = handle;
export const POST = handle;
