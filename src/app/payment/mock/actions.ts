"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { fulfillPaidOrder } from "@/lib/commerce";
import { activateSubscription } from "@/lib/subscription";
import { mockGatewayEnabled } from "@/lib/gateway";

/** Chặn cổng giả lập khi đã có cổng thật / ở production (chống bypass thanh toán). */
function assertMockEnabled() {
  if (!mockGatewayEnabled()) redirect("/cart?error=Cổng thanh toán giả lập đã bị vô hiệu");
}

async function loadOwnPendingOrder(orderId: string) {
  const user = await requireUser();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.buyerId !== user.id) redirect("/cart?error=Đơn hàng không hợp lệ");
  return order!;
}

export async function mockPaySuccessAction(formData: FormData) {
  assertMockEnabled();
  const orderId = String(formData.get("orderId") ?? "");
  const order = await loadOwnPendingOrder(orderId);
  if (order.status === "PENDING") {
    await fulfillPaidOrder(order.id, `MOCK-${Date.now()}`);
  }
  redirect(`/payment/result?status=success&order=${order.id}`);
}

export async function mockPayFailAction(formData: FormData) {
  assertMockEnabled();
  const orderId = String(formData.get("orderId") ?? "");
  const order = await loadOwnPendingOrder(orderId);
  if (order.status === "PENDING") {
    await prisma.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
  }
  redirect(`/payment/result?status=failed&order=${order.id}`);
}

export async function mockSubSuccessAction(formData: FormData) {
  assertMockEnabled();
  const user = await requireUser();
  const subId = String(formData.get("subId") ?? "");
  const sub = await prisma.subscription.findUnique({ where: { id: subId } });
  if (!sub || sub.userId !== user.id) redirect("/subscription?error=Không hợp lệ");
  if (sub!.status === "PENDING") await activateSubscription(sub!.id, `MOCK-${Date.now()}`);
  redirect("/subscription?activated=1");
}

export async function mockSubFailAction(formData: FormData) {
  assertMockEnabled();
  const user = await requireUser();
  const subId = String(formData.get("subId") ?? "");
  const sub = await prisma.subscription.findUnique({ where: { id: subId } });
  if (sub && sub.userId === user.id && sub.status === "PENDING") {
    await prisma.subscription.update({ where: { id: sub.id }, data: { status: "CANCELLED" } });
  }
  redirect("/subscription?error=Thanh toán thất bại");
}
