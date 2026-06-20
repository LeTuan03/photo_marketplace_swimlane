import { type NextRequest, NextResponse } from "next/server";
import { isValidCronSecret } from "@/lib/cron";
import { releaseDueEscrows } from "@/lib/commerce";
import { expireStaleSwaps } from "@/lib/swap";
import { expireDueSubscriptions } from "@/lib/subscription";
import { expireDueDmca } from "@/lib/dmca";

/**
 * Cron bảo trì định kỳ:
 *  - Giải ngân escrow hết hạn giữ (TT4)
 *  - Hết hạn đề nghị swap quá 48h (SW3b)
 *  - Hết hạn subscription -> hạ về Free (TT7)
 *  - Hết hạn 7 ngày khiếu nại DMCA không phản biện -> gỡ ảnh (S10b)
 * Bảo vệ bằng CRON_SECRET. Ưu tiên header `x-cron-secret` (không lọt vào log/referer
 * như query-string); vẫn chấp nhận ?secret= để tương thích cron cũ. So sánh constant-time.
 */
async function handle(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret") ?? "";
  if (!isValidCronSecret(secret)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const [escrowsReleased, swapsExpired, subsExpired, dmcaRemoved] = await Promise.all([
    releaseDueEscrows(),
    expireStaleSwaps(),
    expireDueSubscriptions(),
    expireDueDmca(),
  ]);
  return NextResponse.json({
    ok: true,
    escrowsReleased,
    swapsExpired,
    subsExpired,
    dmcaRemoved,
    at: new Date().toISOString(),
  });
}

export const GET = handle;
export const POST = handle;
