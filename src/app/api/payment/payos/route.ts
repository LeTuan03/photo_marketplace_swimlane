import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookData, isPaymentSuccess, type PayosWebhook } from "@/lib/payos";
import { fulfillPaidOrder } from "@/lib/commerce";
import { activateSubscription } from "@/lib/subscription";

/**
 * Webhook PayOS (server-to-server, POST JSON) — nguồn xác nhận đáng tin cậy duy nhất.
 * PayOS sẽ retry tới khi nhận HTTP 200. Trả {success:true} để PayOS chấp nhận
 * (kể cả ping kiểm tra khi đăng ký webhook -> không khớp đơn vẫn trả 200).
 */
export async function POST(req: NextRequest) {
  let body: PayosWebhook;
  try {
    body = (await req.json()) as PayosWebhook;
  } catch {
    return NextResponse.json({ success: false, message: "Bad request" }, { status: 400 });
  }

  if (!verifyWebhookData(body)) {
    return NextResponse.json({ success: false, message: "Invalid signature" }, { status: 401 });
  }

  const data = body.data!;
  const orderCode = String(data.orderCode);
  const paidAmount = Number(data.amount);
  const success = isPaymentSuccess(body);
  const txnId = String(data.reference ?? data.paymentLinkId ?? "");

  const order = await prisma.order.findUnique({ where: { providerTxnRef: orderCode } });
  if (order) {
    if (paidAmount === order.totalVnd && order.status !== "PAID") {
      if (success) await fulfillPaidOrder(order.id, txnId); // idempotent (atomic claim)
      else await prisma.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
    }
    return NextResponse.json({ success: true });
  }

  const sub = await prisma.subscription.findUnique({ where: { providerTxnRef: orderCode } });
  if (sub && success && paidAmount === sub.priceVnd && sub.status !== "ACTIVE") {
    await activateSubscription(sub.id, txnId);
  }
  return NextResponse.json({ success: true });
}
