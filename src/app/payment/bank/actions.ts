"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { notifyAdmins } from "@/lib/notifications";
import { formatVnd } from "@/lib/money";

/**
 * Người mua bấm "Tôi đã chuyển khoản": báo cho admin vào đối chiếu số dư.
 * Không đổi trạng thái đơn (việc xác nhận do admin làm thủ công ở /admin/payments).
 */
export async function notifyBankTransferAction(formData: FormData) {
  const user = await requireUser();
  const orderId = String(formData.get("orderId") ?? "");
  const subId = String(formData.get("subId") ?? "");

  if (orderId) {
    const order = await prisma.order.findFirst({ where: { id: orderId, buyerId: user.id } });
    if (!order) redirect("/cart?error=Đơn hàng không hợp lệ");
    if (order!.status !== "PAID") {
      await notifyAdmins(
        "Đơn chờ xác nhận chuyển khoản",
        `${user.email} báo đã chuyển khoản đơn ${order!.id.slice(-8).toUpperCase()} — ${formatVnd(order!.totalVnd)}, nội dung ${order!.providerTxnRef}. Vào /admin/payments để đối chiếu.`,
      );
    }
    redirect(`/payment/bank?order=${orderId}&notified=1`);
  }

  if (subId) {
    const sub = await prisma.subscription.findFirst({ where: { id: subId, userId: user.id } });
    if (!sub) redirect("/subscription?error=Không hợp lệ");
    if (sub!.status !== "ACTIVE") {
      await notifyAdmins(
        "Gói chờ xác nhận chuyển khoản",
        `${user.email} báo đã chuyển khoản gói ${sub!.plan} — ${formatVnd(sub!.priceVnd)}, nội dung ${sub!.providerTxnRef}. Vào /admin/payments để đối chiếu.`,
      );
    }
    redirect(`/payment/bank?sub=${subId}&notified=1`);
  }

  redirect("/cart");
}
