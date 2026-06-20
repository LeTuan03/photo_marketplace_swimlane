import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySignature, isPaymentSuccess } from "@/lib/momo";
import { fulfillPaidOrder } from "@/lib/commerce";
import { activateSubscription } from "@/lib/subscription";
import { env } from "@/lib/env";

/** Return URL: trình duyệt người mua quay về sau khi thanh toán ở MoMo. */
export async function GET(req: NextRequest) {
  const query: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => (query[k] = v));

  const result = (status: string, orderId?: string) =>
    NextResponse.redirect(
      `${env.appUrl}/payment/result?status=${status}${orderId ? `&order=${orderId}` : ""}`,
    );

  if (!verifySignature(query)) return result("invalid");
  const paidAmount = Number(query.amount);
  const success = isPaymentSuccess(query);

  const order = await prisma.order.findUnique({ where: { providerTxnRef: query.orderId } });
  if (order) {
    if (success) {
      if (paidAmount !== order.totalVnd) return result("amount_mismatch", order.id);
      await fulfillPaidOrder(order.id, query.transId);
      return result("success", order.id);
    }
    // KHÔNG ghi FAILED từ return-URL (có thể bị replay). IPN mới được ghi FAILED.
    return result("failed", order.id);
  }

  const sub = await prisma.subscription.findUnique({ where: { providerTxnRef: query.orderId } });
  if (sub) {
    if (success) {
      if (paidAmount !== sub.priceVnd) return result("amount_mismatch");
      await activateSubscription(sub.id, query.transId);
      return NextResponse.redirect(`${env.appUrl}/subscription?activated=1`);
    }
    return NextResponse.redirect(`${env.appUrl}/subscription?error=Thanh+toan+that+bai`);
  }

  return result("notfound");
}
