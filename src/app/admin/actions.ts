"use server";

import { redirect } from "next/navigation";
import { redirectError } from "@/lib/nav";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { notify } from "@/lib/notifications";
import { refundOrderItem, fulfillPaidOrder } from "@/lib/commerce";
import { activateSubscription } from "@/lib/subscription";
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
  // -1 = không giới hạn. Chuẩn hoá: nhập trống/0/âm -> -1 (gói UNLIMITED phải là vô hạn).
  // Nếu lưu "0", planQuotaFor sẽ coi như 0 lượt -> người dùng trả tiền KHÔNG tải được gì.
  const unlimitedQuota = intField(formData, "plan_UNLIMITED_quota", -1);
  entries["plan.UNLIMITED.quota"] = String(unlimitedQuota <= 0 ? -1 : unlimitedQuota);

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
  if (!name) redirectError("/admin/categories?error=Tên danh mục trống");
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

const KYC_STATUSES = new Set<KycStatus>(["NONE", "PENDING", "VERIFIED", "REJECTED"]);
const SELLER_TIERS = new Set<SellerTier>(["NEW", "PRO", "ELITE"]);

/** AD9: xác minh KYC người bán. */
export async function setKycAction(formData: FormData) {
  await requireRole("ADMIN");
  const userId = String(formData.get("userId") ?? "");
  const status = String(formData.get("status") ?? "VERIFIED") as KycStatus;
  // Validate enum: form ẩn bị sửa sẽ cho Prisma ném 500; chặn sớm về trang.
  if (!userId || !KYC_STATUSES.has(status)) redirect("/admin/users");
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
  if (!userId || !SELLER_TIERS.has(tier)) redirect("/admin/users");
  await prisma.user.update({ where: { id: userId }, data: { sellerTier: tier } });
  revalidatePath("/admin/users");
  redirect("/admin/users");
}

/** AD7/AD8: giải quyết tranh chấp -> hoàn tiền hoặc bác bỏ. */
export async function resolveDisputeAction(formData: FormData) {
  await requireRole("ADMIN");
  const disputeId = String(formData.get("disputeId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const percent = Math.min(100, Math.max(1, parseInt(String(formData.get("percent") ?? "100"), 10) || 100));

  const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } });
  // Chỉ xử lý tranh chấp còn MỞ -> chống replay (double-submit / bấm 2 lần) gây
  // claw-back nhiều lần, +penaltyPoint nhiều lần, gỡ ảnh lặp lại.
  if (!dispute || dispute.status !== "OPEN") redirect("/admin/disputes");

  // CHỈ dùng đúng giao dịch đã gắn lúc người mua tạo tranh chấp (dispute.orderItemId).
  // Trước đây fallback "đơn mua mới nhất của ảnh" -> nếu người tố cáo KHÔNG mua ảnh
  // (orderItemId=null) sẽ hoàn nhầm cho một người mua khác. Nếu không có giao dịch
  // gắn kèm thì không thể auto-hoàn -> báo admin xử lý thủ công.
  const orderItemId = dispute!.orderItemId;

  if (decision === "refund") {
    if (!orderItemId) {
      redirectError("/admin/disputes?error=Khiếu nại này không gắn với giao dịch mua nào nên không thể tự động hoàn tiền. Hãy đối chiếu thủ công.");
    }
    await refundOrderItem(orderItemId!, dispute!.reason, percent);
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
    // Bác bỏ -> MỞ BĂNG escrow đã đóng băng (nếu có) để giải ngân bình thường.
    if (orderItemId) {
      await prisma.escrowHold.updateMany({
        where: { orderItemId, status: "FROZEN" },
        data: { status: "HELD" },
      });
    }
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

/**
 * Xác nhận đã NHẬN ĐƯỢC tiền chuyển khoản (đối chiếu thủ công qua biến động số dư)
 * -> hoàn tất đơn hàng hoặc kích hoạt gói. Idempotent + atomic ở tầng lib.
 */
export async function confirmBankPaymentAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const kind = String(formData.get("kind") ?? "order");
  const id = String(formData.get("id") ?? "");
  const txnId = `BANK-MANUAL-${admin.id.slice(-6)}`;

  if (kind === "sub") {
    // CHỈ kích hoạt thủ công gói dùng cổng chuyển khoản (BANKQR). Gói qua PayOS/VNPay/MoMo
    // tự xác nhận bằng webhook — nếu cho xác nhận thủ công thì admin có thể kích hoạt
    // khống gói CHƯA trả qua cổng (parity với đơn hàng).
    const sub = await prisma.subscription.findFirst({
      where: { id, status: "PENDING", paymentProvider: "BANKQR" },
    });
    if (sub) await activateSubscription(sub.id, txnId);
  } else {
    // CHỈ xác nhận thủ công đơn dùng cổng chuyển khoản (BANKQR). Trước đây fetch theo
    // id + status PENDING nên admin có thể "đã nhận tiền" cho đơn VNPay/MoMo CHƯA trả
    // qua cổng -> fulfill khống không có tiền. id đến từ form ẩn nên phải khóa provider.
    const order = await prisma.order.findFirst({
      where: { id, status: "PENDING", paymentProvider: "BANKQR" },
    });
    if (order) await fulfillPaidOrder(order.id, txnId);
  }
  revalidatePath("/admin/payments");
  redirect("/admin/payments");
}

/** Hủy đơn/gói đang chờ chuyển khoản (không nhận được tiền hoặc quá hạn). */
export async function rejectBankPaymentAction(formData: FormData) {
  await requireRole("ADMIN");
  const kind = String(formData.get("kind") ?? "order");
  const id = String(formData.get("id") ?? "");

  if (kind === "sub") {
    await prisma.subscription.updateMany({ where: { id, status: "PENDING", paymentProvider: "BANKQR" }, data: { status: "CANCELLED" } });
  } else {
    await prisma.order.updateMany({ where: { id, status: "PENDING", paymentProvider: "BANKQR" }, data: { status: "FAILED" } });
  }
  revalidatePath("/admin/payments");
  redirect("/admin/payments");
}

/**
 * TT5: admin đánh dấu ĐÃ CHI khoản hoàn tiền cho người mua (sau khi chuyển khoản/hoàn
 * qua cổng ngoài hệ thống). Giành nguyên tử PENDING -> SETTLED để không thông báo trùng.
 */
export async function settleRefundAction(formData: FormData) {
  await requireRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").slice(0, 200);
  const rec = await prisma.refundRecord.findUnique({ where: { id } });
  if (!rec || rec.status !== "PENDING") redirect("/admin/refunds");

  const claimed = await prisma.refundRecord.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "SETTLED", settledAt: new Date(), note: note || null },
  });
  if (claimed.count > 0) {
    await notify({
      userId: rec!.buyerId,
      type: "REFUND_DONE",
      title: "Đã hoàn tiền cho bạn",
      body: `Khoản hoàn ${formatVnd(rec!.amountVnd)} đã được chuyển cho bạn.`,
      link: "/library",
      email: true,
    });
  }
  revalidatePath("/admin/refunds");
  redirect("/admin/refunds");
}

/** TT6: admin xử lý yêu cầu rút tiền (đánh dấu đã chi / từ chối hoàn tiền vào ví). */
export async function processPayoutAction(formData: FormData) {
  await requireRole("ADMIN");
  const payoutId = String(formData.get("payoutId") ?? "");
  const action = String(formData.get("action") ?? "");
  const payout = await prisma.payout.findUnique({ where: { id: payoutId } });
  if (!payout || payout.status !== "REQUESTED") redirect("/admin/payouts");

  if (action === "pay") {
    // "Giành" payout nguyên tử REQUESTED -> PAID. Double-submit/đua không tạo
    // được 2 lần PAID + 2 thông báo.
    const claimed = await prisma.payout.updateMany({
      where: { id: payoutId, status: "REQUESTED" },
      data: { status: "PAID", processedAt: new Date() },
    });
    if (claimed.count > 0) {
      await notify({
        userId: payout.sellerId,
        type: "PAYOUT_RELEASED",
        title: "Đã chi trả rút tiền",
        body: `Yêu cầu rút ${formatVnd(payout.amountVnd)} đã được chi trả qua ${payout.method}.`,
        link: "/seller/earnings",
        email: true,
      });
    }
  } else if (action === "reject") {
    // hoàn tiền lại vào ví người bán — "GIÀNH" payout nguyên tử REQUESTED -> REJECTED
    // TRƯỚC khi cộng tiền. Trước đây tx.payout.update vô điều kiện -> 2 request từ chối
    // song song (double-click) cùng cộng tiền = ví người bán bị cộng đôi 1 payout.
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.payout.updateMany({
        where: { id: payoutId, status: "REQUESTED" },
        data: { status: "REJECTED", processedAt: new Date() },
      });
      if (claimed.count === 0) return; // luồng khác đã xử lý -> không cộng tiền trùng
      const u = await tx.user.update({
        where: { id: payout.sellerId },
        data: { balanceVnd: { increment: payout.amountVnd } },
      });
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
