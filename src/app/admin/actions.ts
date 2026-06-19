"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { notify } from "@/lib/notifications";
import { refundOrderItem } from "@/lib/commerce";
import { upholdDmcaClaim, restoreDmcaClaim } from "@/lib/dmca";
import { saveSettings } from "@/lib/settings";
import { formatVnd } from "@/lib/money";
import { LICENSE_ORDER } from "@/lib/constants";
import type { SellerTier, KycStatus } from "@prisma/client";

function intField(fd: FormData, key: string, fallback = 0): number {
  const n = parseInt(String(fd.get(key) ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

/** AD2/AD3/AD4: lưu cấu hình giá & hoa hồng & gói. */
export async function updatePlatformSettingsAction(formData: FormData) {
  await requireRole("ADMIN");
  const entries: Record<string, string> = {};

  // AD4 hoa hồng theo tier (phần trăm 0..90)
  for (const tier of ["NEW", "PRO", "ELITE"] as SellerTier[]) {
    const pct = Math.min(90, Math.max(0, intField(formData, `comm_${tier}`)));
    entries[`commission.${tier}`] = String(pct);
  }

  // AD3 gói subscription
  entries["plan.PRO.price"] = String(Math.max(0, intField(formData, "plan_PRO_price")));
  entries["plan.PRO.quota"] = String(Math.max(0, intField(formData, "plan_PRO_quota")));
  entries["plan.UNLIMITED.price"] = String(Math.max(0, intField(formData, "plan_UNLIMITED_price")));
  // -1 = không giới hạn
  entries["plan.UNLIMITED.quota"] = String(intField(formData, "plan_UNLIMITED_quota", -1));

  // AD2 giá license mặc định gợi ý
  for (const lt of LICENSE_ORDER) {
    entries[`license.${lt}.price`] = String(Math.max(0, intField(formData, `lic_${lt}`)));
  }

  await saveSettings(entries);
  revalidatePath("/admin/settings");
  redirect("/admin/settings?saved=1");
}

function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // bỏ dấu tiếng Việt
    .replace(/[đĐ]/g, "d") // đ/Đ -> d
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return base || "danh-muc";
}

/** AD1: thêm danh mục. */
export async function createCategoryAction(formData: FormData) {
  await requireRole("ADMIN");
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  if (!name) redirect("/admin/categories?error=Tên danh mục trống");
  let slug = slugify(name);
  // đảm bảo slug duy nhất
  if (await prisma.category.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  const count = await prisma.category.count();
  await prisma.category.create({ data: { name, slug, sortOrder: count } });
  revalidatePath("/admin/categories");
  redirect("/admin/categories");
}

/** AD1: đổi tên danh mục. */
export async function updateCategoryAction(formData: FormData) {
  await requireRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  if (id && name) await prisma.category.update({ where: { id }, data: { name } });
  revalidatePath("/admin/categories");
  redirect("/admin/categories");
}

/** AD1: xoá danh mục (gỡ liên kết khỏi ảnh trước). */
export async function deleteCategoryAction(formData: FormData) {
  await requireRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  if (id) {
    await prisma.$transaction(async (tx) => {
      await tx.photo.updateMany({ where: { categoryId: id }, data: { categoryId: null } });
      await tx.category.delete({ where: { id } });
    });
  }
  revalidatePath("/admin/categories");
  redirect("/admin/categories");
}

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
  const percent = Math.min(100, Math.max(1, parseInt(String(formData.get("percent") ?? "100"), 10) || 100));

  const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } });
  if (!dispute) redirect("/admin/disputes");

  if (decision === "refund") {
    if (orderItemId) await refundOrderItem(orderItemId, dispute!.reason, percent);
    // gỡ ảnh nếu là DMCA
    if (dispute!.reason === "DMCA" && dispute!.photoId) {
      await prisma.photo.update({ where: { id: dispute!.photoId }, data: { status: "REMOVED" } });
    }
    // B9: lỗi thuộc về người bán -> trừ điểm uy tín
    if (dispute!.photoId) {
      const ph = await prisma.photo.findUnique({ where: { id: dispute!.photoId }, select: { sellerId: true } });
      if (ph) await prisma.user.update({ where: { id: ph.sellerId }, data: { penaltyPoints: { increment: 1 } } });
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

/** AD7: admin phán quyết khiếu nại DMCA. */
export async function resolveDmcaAction(formData: FormData) {
  await requireRole("ADMIN");
  const claimId = String(formData.get("claimId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").slice(0, 300);

  if (decision === "uphold") {
    await upholdDmcaClaim(claimId, note || "Quản trị viên chấp nhận khiếu nại.");
  } else {
    await restoreDmcaClaim(claimId, note || "Quản trị viên bác khiếu nại.");
  }
  revalidatePath("/admin/dmca");
  redirect("/admin/dmca");
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
