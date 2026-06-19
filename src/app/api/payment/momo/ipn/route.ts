import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySignature, isPaymentSuccess } from "@/lib/momo";
import { fulfillPaidOrder } from "@/lib/commerce";
import { activateSubscription } from "@/lib/subscription";

/**
 * IPN MoMo (server-to-server, POST JSON). Là nguồn xác nhận đáng tin cậy.
 * Trả 204 No Content khi đã tiếp nhận.
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

  const paidAmount = Number(p.amount);
  const success = isPaymentSuccess(p);

  const order = await prisma.order.findUnique({ where: { providerTxnRef: p.orderId } });
  if (order) {
    if (paidAmount === order.totalVnd && order.status !== "PAID") {
      if (success) await fulfillPaidOrder(order.id, p.transId);
      else await prisma.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
    }
    return new NextResponse(null, { status: 204 });
  }

  const sub = await prisma.subscription.findUnique({ where: { providerTxnRef: p.orderId } });
  if (sub && success && paidAmount === sub.priceVnd && sub.status !== "ACTIVE") {
    await activateSubscription(sub.id, p.transId);
  }
  return new NextResponse(null, { status: 204 });
}
