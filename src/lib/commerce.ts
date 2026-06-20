import "server-only";
import { prisma } from "./prisma";
import { env } from "./env";
import { notify, notifyAdmins } from "./notifications";
import { randomToken, makeCertNo } from "./utils";
import { formatVnd } from "./money";

/** Tính phí platform & phần người bán nhận được cho một item theo tỉ lệ hoa hồng (0..1). */
export function splitPrice(priceVnd: number, rate: number) {
  const fee = Math.round(priceVnd * rate);
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
  if (order.status === "PAID") return; // đã xử lý (kiểm tra nhanh trước khi vào transaction)

  const holdUntil = new Date(Date.now() + env.rules.escrowHoldDays * 24 * 3600 * 1000);
  const downloadExpiry = new Date(Date.now() + env.rules.downloadLinkHours * 3600 * 1000);

  // "Giành" đơn nguyên tử: chỉ tiến hành nếu chuyển được PENDING -> PAID.
  // Webhook và return-URL (hoặc nhiều lần retry webhook) có thể chạy đồng thời;
  // updateMany có điều kiện status đảm bảo CHỈ một luồng tạo escrow/grant.
  const didFulfill = await prisma.$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({
      where: { id: order.id, status: "PENDING" },
      data: { status: "PAID", paidAt: new Date(), providerTxnId },
    });
    if (claimed.count === 0) return false; // luồng khác đã xử lý

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
    return true;
  });

  if (!didFulfill) return; // không phải luồng thắng -> không bắn thông báo trùng

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
    const released = await prisma.$transaction(async (tx) => {
      // "Giành" escrow nguyên tử HELD -> RELEASED; nếu 2 lần cron chạy chồng nhau
      // chỉ một lần khớp (count===1) nên không cộng tiền trùng.
      const claimed = await tx.escrowHold.updateMany({
        where: { id: e.id, status: "HELD" },
        data: { status: "RELEASED", releasedAt: new Date() },
      });
      if (claimed.count === 0) return false;

      const user = await tx.user.update({
        where: { id: e.sellerId },
        data: { balanceVnd: { increment: e.amountVnd } },
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
      return true;
    });

    if (!released) continue; // đã được luồng khác giải ngân -> không notify/đếm trùng

    // notify là best-effort: lỗi gửi/ghi thông báo KHÔNG được làm hỏng cả vòng cron
    // (tiền đã giải ngân an toàn trong transaction ở trên).
    try {
      await notify({
        userId: e.sellerId,
        type: "PAYOUT_RELEASED",
        title: "Tiền đã được giải ngân",
        body: `${formatVnd(e.amountVnd)} đã được giải ngân vào số dư rút được của bạn.`,
        link: "/seller/earnings",
        email: true,
      });
    } catch (err) {
      console.error("releaseDueEscrows notify error:", err);
    }
    count++;
  }
  return count;
}

/**
 * Hoàn tiền một item (TT5). percent = phần trăm hoàn cho người mua (1..100).
 * - 100%: hoàn toàn bộ, gỡ quyền tải, escrow REFUNDED / hoặc claw back nếu đã giải ngân.
 * - <100%: hoàn một phần, người mua vẫn giữ file; phần người bán giảm tương ứng.
 */
export async function refundOrderItem(orderItemId: string, reason: string, percent = 100): Promise<void> {
  const pct = Math.min(100, Math.max(1, Math.round(percent)));
  const full = pct >= 100;

  const item = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    include: { escrow: true, order: true },
  });
  if (!item) throw new Error("ITEM_NOT_FOUND");

  const buyerRefund = Math.round((item.priceVnd * pct) / 100);
  const sellerKeep = Math.round((item.sellerEarningVnd * (100 - pct)) / 100);
  const clawback = item.sellerEarningVnd - sellerKeep;

  // Trả về false nếu KHÔNG có gì để hoàn (đã hoàn trước đó) -> không bắn thông báo trùng.
  const applied = await prisma.$transaction(async (tx) => {
    if (item.escrow) {
      const st = item.escrow.status;
      // HELD hoặc FROZEN (đóng băng do tranh chấp) -> tiền vẫn trong escrow.
      if (st === "HELD" || st === "FROZEN") {
        if (full) {
          const c = await tx.escrowHold.updateMany({
            where: { id: item.escrow.id, status: { in: ["HELD", "FROZEN"] } },
            data: { status: "REFUNDED" },
          });
          if (c.count === 0) return false; // luồng khác đã hoàn
        } else {
          // Hoàn một phần: giảm phần escrow xuống đúng phần người bán được giữ,
          // mở băng về HELD để giải ngân bình thường phần còn lại.
          const c = await tx.escrowHold.updateMany({
            where: { id: item.escrow.id, status: { in: ["HELD", "FROZEN"] } },
            data: { amountVnd: sellerKeep, status: "HELD" },
          });
          if (c.count === 0) return false;
        }
      } else if (st === "RELEASED") {
        if (clawback > 0) {
          // Người bán đã nhận tiền -> "giành" RELEASED -> REFUNDED NGUYÊN TỬ rồi mới trừ.
          // Chống claw-back nhiều lần khi có >1 đường resolve cùng một item. Trừ đủ
          // clawback (cho phép số dư âm = ghi nợ); payout đã chặn rút khi âm.
          const c = await tx.escrowHold.updateMany({
            where: { id: item.escrow.id, status: "RELEASED" },
            data: { status: "REFUNDED" },
          });
          if (c.count === 0) return false; // đã claw back rồi
          const u = await tx.user.update({
            where: { id: item.sellerId },
            data: { balanceVnd: { decrement: clawback } },
            select: { balanceVnd: true },
          });
          await tx.walletTransaction.create({
            data: {
              userId: item.sellerId,
              type: "REFUND_ADJUST",
              amountVnd: -clawback,
              balanceAfterVnd: u.balanceVnd,
              ref: item.id,
              note: `Trừ lại do hoàn ${pct}% cho người mua`,
            },
          });
        }
      } else {
        // escrow đã ở trạng thái cuối (REFUNDED) -> không hoàn lại lần nữa.
        return false;
      }
    }
    if (full) {
      await tx.downloadGrant.updateMany({ where: { orderItemId: item.id }, data: { maxDownloads: 0 } });
    }
    return true;
  });

  if (!applied) return;

  await notify({
    userId: item.order.buyerId,
    type: "REFUND_DONE",
    title: full ? "Hoàn tiền toàn bộ" : "Hoàn tiền một phần",
    body: `Bạn được hoàn ${formatVnd(buyerRefund)} (${pct}%) cho 1 ảnh. Lý do: ${reason}.`,
    link: "/library",
    email: true,
  });
  await notifyAdmins("Đã hoàn tiền 1 giao dịch", `Item ${orderItemId} — hoàn ${pct}% (${formatVnd(buyerRefund)}) — ${reason}`);
}
