import "server-only";
import { prisma } from "./prisma";
import { fulfillPaidOrder, flagPaymentMismatch } from "./commerce";
import { activateSubscription } from "./subscription";

/**
 * Xác nhận thanh toán từ một cổng (IPN/webhook) cho ĐƠN HÀNG hoặc GÓI khớp theo
 * providerTxnRef. Tập trung toàn bộ quy tắc dùng chung cho VNPay/MoMo/PayOS/SePay:
 *  - đã PAID/ACTIVE  -> "already" (idempotent, không xử lý lại)
 *  - lệch số tiền     -> "mismatch" (+ cảnh báo admin nếu cổng báo đã nhận tiền)
 *  - thành công       -> fulfill đơn / kích hoạt gói  ("fulfilled")
 *  - thất bại         -> đơn FAILED / gói PENDING->CANCELLED ("failed")
 *  - không khớp gì    -> "notfound"
 * Mọi mutation đã idempotent/atomic ở tầng lib (fulfillPaidOrder/activateSubscription).
 */
export type ConfirmOutcome = "fulfilled" | "failed" | "mismatch" | "already" | "notfound";
export type ConfirmResult = { kind: "order" | "sub" | "none"; outcome: ConfirmOutcome };

export async function confirmGatewayPayment(args: {
  txnRef: string;
  paidVnd: number;
  success: boolean;
  provider: string;
  txnId?: string;
}): Promise<ConfirmResult> {
  const { txnRef, paidVnd, success, provider, txnId } = args;

  const order = await prisma.order.findUnique({ where: { providerTxnRef: txnRef } });
  if (order) {
    if (order.status === "PAID") return { kind: "order", outcome: "already" };
    if (paidVnd !== order.totalVnd) {
      if (success) {
        await flagPaymentMismatch({ kind: "order", refId: order.id, provider, expectedVnd: order.totalVnd, paidVnd, txnId });
      }
      return { kind: "order", outcome: "mismatch" };
    }
    if (success) {
      await fulfillPaidOrder(order.id, txnId);
      return { kind: "order", outcome: "fulfilled" };
    }
    // Chỉ IPN/webhook server-to-server mới được ghi FAILED (return-URL không gọi hàm này).
    await prisma.order.updateMany({ where: { id: order.id, status: "PENDING" }, data: { status: "FAILED" } });
    return { kind: "order", outcome: "failed" };
  }

  const sub = await prisma.subscription.findUnique({ where: { providerTxnRef: txnRef } });
  if (sub) {
    if (sub.status === "ACTIVE") return { kind: "sub", outcome: "already" };
    if (paidVnd !== sub.priceVnd) {
      if (success) {
        await flagPaymentMismatch({ kind: "sub", refId: sub.id, provider, expectedVnd: sub.priceVnd, paidVnd, txnId });
      }
      return { kind: "sub", outcome: "mismatch" };
    }
    if (success) {
      await activateSubscription(sub.id, txnId);
      return { kind: "sub", outcome: "fulfilled" };
    }
    // Thanh toán gói thất bại -> hủy gói đang chờ để không kẹt PENDING + chống retry
    // muộn kích hoạt lại (gói không có trạng thái FAILED).
    await prisma.subscription.updateMany({ where: { id: sub.id, status: "PENDING" }, data: { status: "CANCELLED" } });
    return { kind: "sub", outcome: "failed" };
  }

  return { kind: "none", outcome: "notfound" };
}
