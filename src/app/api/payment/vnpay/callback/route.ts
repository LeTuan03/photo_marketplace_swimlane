import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySignature, isPaymentSuccess } from "@/lib/vnpay";
import { fulfillPaidOrder } from "@/lib/commerce";
import { env } from "@/lib/env";

/** Return URL: trình duyệt người mua quay về sau khi thanh toán ở VNPay. */
export async function GET(req: NextRequest) {
  const query: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => (query[k] = v));

  const result = (status: string, orderId?: string) =>
    NextResponse.redirect(
      `${env.appUrl}/payment/result?status=${status}${orderId ? `&order=${orderId}` : ""}`,
    );

  if (!verifySignature(query)) return result("invalid");

  const order = await prisma.order.findUnique({ where: { providerTxnRef: query.vnp_TxnRef } });
  if (!order) return result("notfound");

  if (isPaymentSuccess(query)) {
    // Xác nhận số tiền khớp
    const paidAmount = Number(query.vnp_Amount) / 100;
    if (paidAmount !== order.totalVnd) return result("amount_mismatch", order.id);
    await fulfillPaidOrder(order.id, query.vnp_TransactionNo); // idempotent
    return result("success", order.id);
  }

  if (order.status === "PENDING") {
    await prisma.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
  }
  return result("failed", order.id);
}
