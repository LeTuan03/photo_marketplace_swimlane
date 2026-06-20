"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { notify, notifyAdmins } from "@/lib/notifications";
import { DMCA_WINDOW_DAYS } from "@/lib/dmca";
import type { LicenseType } from "@prisma/client";

export async function addToCartAction(formData: FormData) {
  const user = await getCurrentUser();
  const photoId = String(formData.get("photoId") ?? "");
  const licenseType = String(formData.get("licenseType") ?? "") as LicenseType;
  const sizeLabel = String(formData.get("sizeLabel") ?? "ORIGINAL");
  const buyNow = formData.get("buyNow") === "1";

  if (!user) redirect(`/login?next=/photos/${photoId}`);

  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
    include: { licenses: true },
  });
  if (!photo || photo.status !== "LIVE") redirect(`/photos/${photoId}?error=Ảnh không khả dụng`);

  const license = photo!.licenses.find((l) => l.type === licenseType);
  if (!license) redirect(`/photos/${photoId}?error=License không hợp lệ`);

  if (photo!.sellerId === user!.id) {
    redirect(`/photos/${photoId}?error=Không thể mua ảnh của chính bạn`);
  }

  await prisma.cartItem.upsert({
    where: { userId_photoId_licenseType: { userId: user!.id, photoId, licenseType } },
    update: { sizeLabel, priceVnd: license!.priceVnd },
    create: { userId: user!.id, photoId, licenseType, sizeLabel, priceVnd: license!.priceVnd },
  });

  revalidatePath("/cart");
  redirect(buyNow ? "/checkout" : "/cart");
}

export async function removeCartItemAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  await prisma.cartItem.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/cart");
  redirect("/cart");
}

export async function clearCartAction() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await prisma.cartItem.deleteMany({ where: { userId: user.id } });
  revalidatePath("/cart");
  redirect("/cart");
}

/** Báo cáo sự cố / vi phạm bản quyền trên một ảnh (B9 / B10 -> AD7/AD8). */
export async function reportPhotoAction(formData: FormData) {
  const user = await getCurrentUser();
  const photoId = String(formData.get("photoId") ?? "");
  if (!user) redirect(`/login?next=/photos/${photoId}`);

  const reason = String(formData.get("reason") ?? "OTHER");
  const detail = String(formData.get("detail") ?? "").slice(0, 1000);

  // Nhánh DMCA: tạo claim, ẩn ảnh, mở cửa sổ phản biện 7 ngày (AD7/S10b/N8)
  if (reason === "DMCA") {
    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
      select: { id: true, sellerId: true, title: true, status: true },
    });
    if (!photo) redirect("/");
    if (photo!.sellerId === user!.id) redirect(`/photos/${photoId}?error=Không thể khiếu nại ảnh của chính bạn`);
    if (photo!.status !== "LIVE" && photo!.status !== "LOCKED") {
      redirect(`/photos/${photoId}?error=Ảnh không ở trạng thái có thể khiếu nại`);
    }
    const dup = await prisma.dmcaClaim.findFirst({
      where: { photoId, claimantId: user!.id, status: { in: ["OPEN", "COUNTERED"] } },
    });
    if (dup) redirect("/?dmca=1");

    const deadline = new Date(Date.now() + DMCA_WINDOW_DAYS * 24 * 3600 * 1000);
    await prisma.$transaction(async (tx) => {
      await tx.dmcaClaim.create({ data: { photoId, claimantId: user!.id, evidence: detail, deadline } });
      await tx.photo.update({ where: { id: photoId }, data: { status: "DMCA_HOLD" } });
    });

    await notify({
      userId: photo!.sellerId,
      type: "DMCA",
      title: "Ảnh bị khiếu nại bản quyền (DMCA)",
      body: `"${photo!.title}" đã bị ẩn do có khiếu nại DMCA. Bạn có ${DMCA_WINDOW_DAYS} ngày để gửi phản biện (counter-claim), nếu không ảnh sẽ bị gỡ vĩnh viễn.`,
      link: "/seller/inventory",
      email: true,
    });
    await notifyAdmins(
      "Khiếu nại DMCA mới",
      `Ảnh "${photo!.title}" bị khiếu nại. Hạn phản biện: ${deadline.toLocaleDateString("vi-VN")}.`,
      "/admin/dmca",
    );
    redirect("/?dmca=1");
  }

  // Gắn đúng giao dịch của người báo cáo (nếu họ đã mua ảnh này) và ĐÓNG BĂNG escrow:
  // cron `releaseDueEscrows` chỉ giải ngân escrow HELD, nên FROZEN sẽ được giữ lại
  // tới khi admin xử lý -> tránh giải ngân cho người bán rồi phải claw-back âm khi hoàn.
  const myItem = await prisma.orderItem.findFirst({
    where: { photoId, order: { buyerId: user!.id, status: "PAID" } },
    orderBy: { createdAt: "desc" },
    include: { escrow: true },
  });
  await prisma.$transaction(async (tx) => {
    await tx.dispute.create({
      data: { photoId, orderItemId: myItem?.id ?? null, raisedById: user!.id, reason, detail, status: "OPEN" },
    });
    if (myItem?.escrow && myItem.escrow.status === "HELD") {
      await tx.escrowHold.update({ where: { id: myItem.escrow.id }, data: { status: "FROZEN" } });
    }
  });
  await notifyAdmins(
    "Có báo cáo mới về ảnh",
    `Lý do: ${reason}. ${detail}`,
    `/admin/disputes`,
  );
  redirect(`/photos/${photoId}?reported=1`);
}
