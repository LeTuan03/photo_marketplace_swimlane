"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

/** Người mua đánh giá ảnh đã sở hữu (mua / swap / gói). Tạo mới hoặc cập nhật. */
export async function submitReviewAction(formData: FormData) {
  const user = await requireUser();
  const photoId = String(formData.get("photoId") ?? "");
  const rating = Math.min(5, Math.max(1, parseInt(String(formData.get("rating") ?? "0"), 10)));
  const comment = String(formData.get("comment") ?? "").slice(0, 1000);

  if (!rating) redirect(`/photos/${photoId}?error=Vui lòng chọn số sao`);

  const photo = await prisma.photo.findUnique({ where: { id: photoId }, select: { id: true, sellerId: true } });
  if (!photo) redirect("/");
  if (photo.sellerId === user.id) redirect(`/photos/${photoId}?error=Không thể tự đánh giá ảnh của mình`);

  // điều kiện: đã sở hữu file (có DownloadGrant) -> đánh giá đã xác thực
  const owns = await prisma.downloadGrant.findFirst({ where: { buyerId: user.id, photoId } });
  if (!owns) redirect(`/photos/${photoId}?error=Chỉ người đã mua/nhận ảnh mới được đánh giá`);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.review.findUnique({
      where: { photoId_buyerId: { photoId, buyerId: user.id } },
    });
    if (!existing) {
      await tx.review.create({
        data: { photoId, sellerId: photo.sellerId, buyerId: user.id, rating, comment },
      });
      await tx.photo.update({
        where: { id: photoId },
        data: { ratingSum: { increment: rating }, ratingCount: { increment: 1 } },
      });
      await tx.user.update({
        where: { id: photo.sellerId },
        data: { ratingSum: { increment: rating }, ratingCount: { increment: 1 } },
      });
    } else {
      const delta = rating - existing.rating;
      await tx.review.update({ where: { id: existing.id }, data: { rating, comment } });
      if (delta !== 0) {
        await tx.photo.update({ where: { id: photoId }, data: { ratingSum: { increment: delta } } });
        await tx.user.update({ where: { id: photo.sellerId }, data: { ratingSum: { increment: delta } } });
      }
    }
  });

  revalidatePath(`/photos/${photoId}`);
  redirect(`/photos/${photoId}?reviewed=1#reviews`);
}

/** Xoá đánh giá của chính mình. */
export async function deleteReviewAction(formData: FormData) {
  const user = await requireUser();
  const reviewId = String(formData.get("reviewId") ?? "");
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review || review.buyerId !== user.id) redirect("/");

  await prisma.$transaction(async (tx) => {
    await tx.review.delete({ where: { id: review.id } });
    await tx.photo.update({
      where: { id: review.photoId },
      data: { ratingSum: { decrement: review.rating }, ratingCount: { decrement: 1 } },
    });
    await tx.user.update({
      where: { id: review.sellerId },
      data: { ratingSum: { decrement: review.rating }, ratingCount: { decrement: 1 } },
    });
  });

  revalidatePath(`/photos/${review.photoId}`);
  redirect(`/photos/${review.photoId}#reviews`);
}
