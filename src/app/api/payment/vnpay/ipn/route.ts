import { type NextRequest, NextResponse } from "next/server";
import { verifySignature, isPaymentSuccess } from "@/lib/vnpay";
import { confirmGatewayPayment } from "@/lib/payment-confirm";

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

  const res = await confirmGatewayPayment({
    txnRef: query.vnp_TxnRef,
    paidVnd: Number(query.vnp_Amount) / 100,
    success: isPaymentSuccess(query),
    provider: "VNPAY",
    txnId: query.vnp_TransactionNo,
  });

  switch (res.outcome) {
    case "notfound":
      return NextResponse.json({ RspCode: "01", Message: "Order not found" });
    case "mismatch":
      return NextResponse.json({ RspCode: "04", Message: "Invalid amount" });
    case "already":
      return NextResponse.json({ RspCode: "02", Message: "Order already confirmed" });
    default:
      return NextResponse.json({ RspCode: "00", Message: "Confirm Success" });
  }
}
