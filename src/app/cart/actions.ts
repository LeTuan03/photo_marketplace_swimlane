"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { notifyAdmins } from "@/lib/notifications";
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

  await prisma.dispute.create({
    data: { photoId, raisedById: user!.id, reason, detail, status: "OPEN" },
  });
  await notifyAdmins(
    "Có báo cáo mới về ảnh",
    `Lý do: ${reason}. ${detail}`,
    `/admin/disputes`,
  );
  redirect(`/photos/${photoId}?reported=1`);
}
