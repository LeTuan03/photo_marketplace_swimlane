import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

/**
 * Return/Cancel URL của PayOS: trình duyệt người mua quay về sau khi thanh toán.
 * CHỈ để hiển thị kết quả — KHÔNG đổi trạng thái đơn (tham số ở đây không ký).
 * Việc cộng tiền/cấp quyền do webhook (đã ký) đảm nhiệm. Nếu webhook chưa kịp tới,
 * trang /payment/result sẽ tự làm mới tới khi đơn chuyển PAID.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const orderCode = sp.get("orderCode") ?? "";
  const paid = sp.get("status") === "PAID" && sp.get("cancel") !== "true";

  // Subscription?
  const sub = await prisma.subscription.findUnique({ where: { providerTxnRef: orderCode } });
  if (sub) {
    return NextResponse.redirect(
      paid
        ? `${env.appUrl}/subscription?activated=1`
        : `${env.appUrl}/subscription?error=Thanh+toan+chua+hoan+tat`,
    );
  }

  const order = await prisma.order.findUnique({ where: { providerTxnRef: orderCode } });
  const orderParam = order ? `&order=${order.id}` : "";
  return NextResponse.redirect(
    `${env.appUrl}/payment/result?status=${paid ? "success" : "failed"}${orderParam}`,
  );
}
