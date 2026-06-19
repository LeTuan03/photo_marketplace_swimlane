import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { releaseDueEscrows } from "@/lib/commerce";
import { expireStaleSwaps } from "@/lib/swap";
import { expireDueSubscriptions } from "@/lib/subscription";

/**
 * Cron bảo trì định kỳ:
 *  - Giải ngân escrow hết hạn giữ (TT4)
 *  - Hết hạn đề nghị swap quá 48h (SW3b)
 *  - Hết hạn subscription -> hạ về Free (TT7)
 * Bảo vệ bằng CRON_SECRET (query ?secret= hoặc header x-cron-secret).
 */
async function handle(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") ?? req.headers.get("x-cron-secret") ?? "";
  if (secret !== env.cronSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const [escrowsReleased, swapsExpired, subsExpired] = await Promise.all([
    releaseDueEscrows(),
    expireStaleSwaps(),
    expireDueSubscriptions(),
  ]);
  return NextResponse.json({
    ok: true,
    escrowsReleased,
    swapsExpired,
    subsExpired,
    at: new Date().toISOString(),
  });
}

export const GET = handle;
export const POST = handle;
