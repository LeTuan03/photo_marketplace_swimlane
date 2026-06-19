"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { notify } from "@/lib/notifications";
import { refundOrderItem } from "@/lib/commerce";
import { formatVnd } from "@/lib/money";
import type { SellerTier, KycStatus } from "@prisma/client";

/** AD6 + N1: duyệt ảnh -> LIVE. */
export async function approvePhotoAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const photoId = String(formData.get("photoId") ?? "");
  const photo = await prisma.photo.update({
    where: { id: photoId },
    data: { status: "LIVE", reviewedAt: new Date(), reviewedBy: admin.id, rejectionReason: null },
  });
  await notify({
    userId: photo.sellerId,
    type: "PHOTO_APPROVED",
    title: "Ảnh đã được duyệt",
    body: `"${photo.title}" đã được duyệt và đang hiển thị trên marketplace.`,
    link: `/photos/${photo.id}`,
    email: true,
  });
  revalidatePath("/admin/review");
  redirect("/admin/review");
}

/** AD6 + N2: từ chối ảnh kèm lý do. */
export async function rejectPhotoAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const photoId = String(formData.get("photoId") ?? "");
  const reason = String(formData.get("reason") ?? "Không đạt tiêu chí").slice(0, 500);
  const photo = await prisma.photo.update({
    where: { id: photoId },
    data: { status: "REJECTED", reviewedAt: new Date(), reviewedBy: admin.id, rejectionReason: reason },
  });
  await notify({
    userId: photo.sellerId,
    type: "PHOTO_REJECTED",
    title: "Ảnh bị từ chối",
    body: `"${photo.title}" bị từ chối. Lý do: ${reason}. Bạn có thể chỉnh sửa và gửi lại.`,
    link: "/seller/inventory",
    email: true,
  });
  revalidatePath("/admin/review");
  redirect("/admin/review");
}

/** AD9: xác minh KYC người bán. */
export async function setKycAction(formData: FormData) {
  await requireRole("ADMIN");
  const userId = String(formData.get("userId") ?? "");
  const status = String(formData.get("status") ?? "VERIFIED") as KycStatus;
  await prisma.user.update({ where: { id: userId }, data: { kycStatus: status } });
  revalidatePath("/admin/users");
  redirect("/admin/users");
}

/** AD9: khóa / mở khóa tài khoản. */
export async function toggleBlockAction(formData: FormData) {
  await requireRole("ADMIN");
  const userId = String(formData.get("userId") ?? "");
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (u) await prisma.user.update({ where: { id: userId }, data: { isBlocked: !u.isBlocked } });
  revalidatePath("/admin/users");
  redirect("/admin/users");
}

/** AD9: nâng/hạ tier người bán (ảnh hưởng hoa hồng). */
export async function setTierAction(formData: FormData) {
  await requireRole("ADMIN");
  const userId = String(formData.get("userId") ?? "");
  const tier = String(formData.get("tier") ?? "NEW") as SellerTier;
  await prisma.user.update({ where: { id: userId }, data: { sellerTier: tier } });
  revalidatePath("/admin/users");
  redirect("/admin/users");
}

/** AD7/AD8: giải quyết tranh chấp -> hoàn tiền hoặc bác bỏ. */
export async function resolveDisputeAction(formData: FormData) {
  await requireRole("ADMIN");
  const disputeId = String(formData.get("disputeId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const orderItemId = String(formData.get("orderItemId") ?? "");

  const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } });
  if (!dispute) redirect("/admin/disputes");

  if (decision === "refund") {
    if (orderItemId) await refundOrderItem(orderItemId, dispute!.reason);
    // gỡ ảnh nếu là DMCA
    if (dispute!.reason === "DMCA" && dispute!.photoId) {
      await prisma.photo.update({ where: { id: dispute!.photoId }, data: { status: "REMOVED" } });
    }
    await prisma.dispute.update({
      where: { id: disputeId },
      data: { status: "RESOLVED_REFUND", resolution: "Đã hoàn tiền cho người mua", resolvedAt: new Date() },
    });
  } else {
    await prisma.dispute.update({
      where: { id: disputeId },
      data: { status: "RESOLVED_REJECT", resolution: "Bác bỏ khiếu nại", resolvedAt: new Date() },
    });
  }
  revalidatePath("/admin/disputes");
  redirect("/admin/disputes");
}

/** TT6: admin xử lý yêu cầu rút tiền (đánh dấu đã chi / từ chối hoàn tiền vào ví). */
export async function processPayoutAction(formData: FormData) {
  await requireRole("ADMIN");
  const payoutId = String(formData.get("payoutId") ?? "");
  const action = String(formData.get("action") ?? "");
  const payout = await prisma.payout.findUnique({ where: { id: payoutId } });
  if (!payout || payout.status !== "REQUESTED") redirect("/admin/payouts");

  if (action === "pay") {
    await prisma.payout.update({
      where: { id: payoutId },
      data: { status: "PAID", processedAt: new Date() },
    });
    await notify({
      userId: payout.sellerId,
      type: "PAYOUT_RELEASED",
      title: "Đã chi trả rút tiền",
      body: `Yêu cầu rút ${formatVnd(payout.amountVnd)} đã được chi trả qua ${payout.method}.`,
      link: "/seller/earnings",
      email: true,
    });
  } else if (action === "reject") {
    // hoàn tiền lại vào ví người bán
    await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: payout.sellerId },
        data: { balanceVnd: { increment: payout.amountVnd } },
      });
      await tx.payout.update({ where: { id: payoutId }, data: { status: "REJECTED", processedAt: new Date() } });
      await tx.walletTransaction.create({
        data: {
          userId: payout.sellerId,
          type: "REFUND_ADJUST",
          amountVnd: payout.amountVnd,
          balanceAfterVnd: u.balanceVnd,
          note: "Hoàn lại do yêu cầu rút tiền bị từ chối",
        },
      });
    });
  }
  revalidatePath("/admin/payouts");
  redirect("/admin/payouts");
}
