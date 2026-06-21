import { type NextRequest, NextResponse } from "next/server";
import { verifyWebhookData, isPaymentSuccess, type PayosWebhook } from "@/lib/payos";
import { confirmGatewayPayment } from "@/lib/payment-confirm";

/**
 * Webhook PayOS (server-to-server, POST JSON) — nguồn xác nhận đáng tin cậy duy nhất.
 * PayOS sẽ retry tới khi nhận HTTP 200. Trả {success:true} để PayOS chấp nhận
 * (kể cả ping kiểm tra khi đăng ký webhook -> không khớp đơn vẫn trả 200).
 * Lệch số tiền -> confirmGatewayPayment cảnh báo admin (không fulfill khống).
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
  await confirmGatewayPayment({
    txnRef: String(data.orderCode),
    paidVnd: Number(data.amount),
    success: isPaymentSuccess(body),
    provider: "PAYOS",
    txnId: String(data.reference ?? data.paymentLinkId ?? ""),
  });
  return NextResponse.json({ success: true });
}
