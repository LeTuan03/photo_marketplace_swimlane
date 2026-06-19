"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { fulfillPaidOrder } from "@/lib/commerce";

async function loadOwnPendingOrder(orderId: string) {
  const user = await requireUser();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.buyerId !== user.id) redirect("/cart?error=Đơn hàng không hợp lệ");
  return order!;
}

export async function mockPaySuccessAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "");
  const order = await loadOwnPendingOrder(orderId);
  if (order.status === "PENDING") {
    await fulfillPaidOrder(order.id, `MOCK-${Date.now()}`);
  }
  redirect(`/payment/result?status=success&order=${order.id}`);
}

export async function mockPayFailAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "");
  const order = await loadOwnPendingOrder(orderId);
  if (order.status === "PENDING") {
    await prisma.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
  }
  redirect(`/payment/result?status=failed&order=${order.id}`);
}
