import { type NextRequest, NextResponse } from "next/server";
import { extractTxnRef, verifyWebhookAuth } from "@/lib/bankqr";
import { confirmGatewayPayment } from "@/lib/payment-confirm";

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

  // Tiền ĐÃ VÀO tài khoản nên success=true; nếu lệch số tiền, helper sẽ cảnh báo admin
  // thay vì im lặng bỏ qua (trước đây tiền vào sai số -> đơn kẹt PENDING, không ai biết).
  await confirmGatewayPayment({
    txnRef,
    paidVnd: amount,
    success: true,
    provider: "BANKQR/SePay",
    txnId: refCode,
  });
  return NextResponse.json({ success: true });
}
