import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySignature, isPaymentSuccess } from "@/lib/vnpay";
import { fulfillPaidOrder } from "@/lib/commerce";

/**
 * IPN (Instant Payment Notification): VNPay gọi server-to-server để xác nhận.
 * Đây là nguồn xác nhận đáng tin cậy nhất. Phải trả đúng định dạng {RspCode, Message}.
 */
export async function GET(req: NextRequest) {
  const query: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => (query[k] = v));

  if (!verifySignature(query)) {
    return NextResponse.json({ RspCode: "97", Message: "Invalid signature" });
  }

  const order = await prisma.order.findUnique({ where: { providerTxnRef: query.vnp_TxnRef } });
  if (!order) return NextResponse.json({ RspCode: "01", Message: "Order not found" });

  const paidAmount = Number(query.vnp_Amount) / 100;
  if (paidAmount !== order.totalVnd) {
    return NextResponse.json({ RspCode: "04", Message: "Invalid amount" });
  }

  if (order.status === "PAID") {
    return NextResponse.json({ RspCode: "02", Message: "Order already confirmed" });
  }

  if (isPaymentSuccess(query)) {
    await fulfillPaidOrder(order.id, query.vnp_TransactionNo);
  } else {
    await prisma.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
  }

  return NextResponse.json({ RspCode: "00", Message: "Confirm Success" });
}
