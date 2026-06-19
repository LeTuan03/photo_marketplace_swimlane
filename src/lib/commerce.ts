import "server-only";
import { prisma } from "./prisma";
import { env } from "./env";
import { commissionRate } from "./constants";
import { notify, notifyAdmins } from "./notifications";
import { randomToken, makeCertNo } from "./utils";
import { formatVnd } from "./money";
import type { SellerTier } from "@prisma/client";

/** Tính phí platform & phần người bán nhận được cho một item. */
export function splitPrice(priceVnd: number, tier: SellerTier) {
  const fee = Math.round(priceVnd * commissionRate(tier));
  return { platformFeeVnd: fee, sellerEarningVnd: priceVnd - fee };
}

/**
 * Hoàn tất một đơn đã thanh toán (TT3): chuyển PAID, tạo escrow giữ 7 ngày,
 * cấp quyền tải (DownloadGrant) + certificate, bắn thông báo N3/N4.
 * Idempotent: gọi lại trên đơn đã PAID sẽ không tạo trùng.
 */
export async function fulfillPaidOrder(orderId: string, providerTxnId?: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { photo: true } } },
  });
  if (!order) throw new Error("ORDER_NOT_FOUND");
  if (order.status === "PAID") return; // đã xử lý

  const holdUntil = new Date(Date.now() + env.rules.escrowHoldDays * 24 * 3600 * 1000);
  const downloadExpiry = new Date(Date.now() + env.rules.downloadLinkHours * 3600 * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { status: "PAID", paidAt: new Date(), providerTxnId },
    });

    for (const item of order.items) {
      // Escrow giữ tiền 7 ngày
      await tx.escrowHold.create({
        data: {
          orderId: order.id,
          orderItemId: item.id,
          sellerId: item.sellerId,
          amountVnd: item.sellerEarningVnd,
          holdUntil,
          status: "HELD",
        },
      });

      // Quyền tải + certificate license
      await tx.downloadGrant.create({
        data: {
          orderItemId: item.id,
          buyerId: order.buyerId,
          photoId: item.photoId,
          token: randomToken(),
          certNo: makeCertNo(),
          licenseType: item.licenseType,
          sizeLabel: item.sizeLabel,
          expiresAt: downloadExpiry,
          maxDownloads: env.rules.maxDownloads,
        },
      });

      await tx.photo.update({
        where: { id: item.photoId },
        data: { salesCount: { increment: 1 } },
      });
    }
  });

  // Thông báo (ngoài transaction)
  await notify({
    userId: order.buyerId,
    type: "PURCHASE_OK",
    title: "Mua ảnh thành công",
    body: `Đơn hàng ${order.id.slice(-8).toUpperCase()} đã thanh toán thành công. Bạn có thể tải file gốc và xem certificate trong Thư viện.`,
    link: "/library",
    email: true,
  });

  // N3: thông báo từng người bán
  const bySeller = new Map<string, typeof order.items>();
  for (const it of order.items) {
    const arr = bySeller.get(it.sellerId) ?? [];
    arr.push(it);
    bySeller.set(it.sellerId, arr);
  }
  for (const [sellerId, items] of bySeller) {
    const total = items.reduce((s, i) => s + i.sellerEarningVnd, 0);
    await notify({
      userId: sellerId,
      type: "PHOTO_SOLD",
      title: "Có người mua ảnh của bạn",
      body: `${items.length} ảnh vừa được bán. Doanh thu ghi nhận (sau phí): ${formatVnd(total)} — đang giữ trong escrow ${env.rules.escrowHoldDays} ngày.`,
      link: "/seller/earnings",
      email: true,
    });
  }
}

/**
 * Giải ngân các escrow đã hết hạn giữ và không có khiếu nại (TT4).
 * Trả về số escrow đã giải ngân.
 */
export async function releaseDueEscrows(): Promise<number> {
  const due = await prisma.escrowHold.findMany({
    where: { status: "HELD", holdUntil: { lte: new Date() } },
    include: { seller: { select: { id: true } } },
  });

  let count = 0;
  for (const e of due) {
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.escrowHold.findUnique({ where: { id: e.id } });
      if (!fresh || fresh.status !== "HELD") return;

      const user = await tx.user.update({
        where: { id: e.sellerId },
        data: { balanceVnd: { increment: e.amountVnd } },
      });
      await tx.escrowHold.update({
        where: { id: e.id },
        data: { status: "RELEASED", releasedAt: new Date() },
      });
      await tx.walletTransaction.create({
        data: {
          userId: e.sellerId,
          type: "ESCROW_RELEASE",
          amountVnd: e.amountVnd,
          balanceAfterVnd: user.balanceVnd,
          ref: e.orderItemId,
          note: "Giải ngân sau khi hết thời gian giữ escrow",
        },
      });
    });

    await notify({
      userId: e.sellerId,
      type: "PAYOUT_RELEASED",
      title: "Tiền đã được giải ngân",
      body: `${formatVnd(e.amountVnd)} đã được giải ngân vào số dư rút được của bạn.`,
      link: "/seller/earnings",
      email: true,
    });
    count++;
  }
  return count;
}

/** Hoàn tiền một item (admin xử lý khiếu nại / DMCA) — đóng băng/hoàn escrow. */
export async function refundOrderItem(orderItemId: string, reason: string): Promise<void> {
  const item = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    include: { escrow: true, order: true },
  });
  if (!item) throw new Error("ITEM_NOT_FOUND");

  await prisma.$transaction(async (tx) => {
    if (item.escrow && item.escrow.status === "HELD") {
      await tx.escrowHold.update({
        where: { id: item.escrow.id },
        data: { status: "REFUNDED" },
      });
    }
    // vô hiệu hóa quyền tải
    await tx.downloadGrant.updateMany({
      where: { orderItemId: item.id },
      data: { maxDownloads: 0 },
    });
  });

  await notify({
    userId: item.order.buyerId,
    type: "REFUND_DONE",
    title: "Hoàn tiền đã được thực hiện",
    body: `Khoản thanh toán cho 1 ảnh đã được hoàn lại. Lý do: ${reason}.`,
    link: "/library",
    email: true,
  });
  await notifyAdmins("Đã hoàn tiền 1 giao dịch", `Item ${orderItemId} — ${reason}`);
}
