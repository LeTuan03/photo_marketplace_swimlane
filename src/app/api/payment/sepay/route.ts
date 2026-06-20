import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractTxnRef, verifyWebhookAuth } from "@/lib/bankqr";
import { fulfillPaidOrder } from "@/lib/commerce";
import { activateSubscription } from "@/lib/subscription";

/**
 * Webhook SePay (server-to-server, POST JSON) khi có tiền VÀO tài khoản ngân hàng.
 * Khớp đơn qua nội dung chuyển khoản (memo = mã PIC...) + đúng số tiền rồi xác nhận.
 * Nguồn xác nhận tin cậy duy nhất; trả {success:true} để SePay ngừng retry.
 * Payload (rút gọn): { transferType:"in", transferAmount, content, referenceCode, ... }
 */
export async function POST(req: NextRequest) {
  if (!verifyWebhookAuth(req.headers.get("authorization"))) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, message: "Bad request" }, { status: 400 });
  }

  // Chỉ xử lý giao dịch tiền vào
  const transferType = body.transferType == null ? "in" : String(body.transferType);
  if (transferType !== "in") return NextResponse.json({ success: true });

  const amount = Number(body.transferAmount ?? body.amount ?? 0);
  const content = String(body.content ?? body.description ?? "");
  const refCode = String(body.referenceCode ?? body.id ?? "");
  const txnRef = extractTxnRef(content);
  if (!txnRef) return NextResponse.json({ success: true }); // không nhận diện được mã -> bỏ qua

  const order = await prisma.order.findUnique({ where: { providerTxnRef: txnRef } });
  if (order) {
    // Đúng số tiền & chưa xử lý -> xác nhận (fulfillPaidOrder idempotent + atomic)
    if (amount === order.totalVnd && order.status !== "PAID") {
      await fulfillPaidOrder(order.id, refCode);
    }
    return NextResponse.json({ success: true });
  }

  const sub = await prisma.subscription.findUnique({ where: { providerTxnRef: txnRef } });
  if (sub && amount === sub.priceVnd && sub.status !== "ACTIVE") {
    await activateSubscription(sub.id, refCode);
  }
  return NextResponse.json({ success: true });
}
