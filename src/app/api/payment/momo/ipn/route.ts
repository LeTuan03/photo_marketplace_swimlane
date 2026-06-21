import { type NextRequest, NextResponse } from "next/server";
import { verifySignature, isPaymentSuccess } from "@/lib/momo";
import { confirmGatewayPayment } from "@/lib/payment-confirm";

/**
 * IPN MoMo (server-to-server, POST JSON). Là nguồn xác nhận đáng tin cậy.
 * Trả 204 No Content khi đã tiếp nhận. Lệch số tiền -> confirmGatewayPayment cảnh báo admin.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Bad request" }, { status: 400 });
  }
  const p: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) p[k] = v == null ? "" : String(v);

  if (!verifySignature(p)) {
    return NextResponse.json({ message: "Invalid signature" }, { status: 400 });
  }

  await confirmGatewayPayment({
    txnRef: p.orderId,
    paidVnd: Number(p.amount),
    success: isPaymentSuccess(p),
    provider: "MOMO",
    txnId: p.transId,
  });
  return new NextResponse(null, { status: 204 });
}
