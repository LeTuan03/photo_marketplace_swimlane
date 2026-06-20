"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { safeInternalPath } from "@/lib/validation";

/** B12: thêm/bỏ ảnh khỏi wishlist (toggle). Lưu giá hiện tại để phát hiện giảm giá. */
export async function toggleWishlistAction(formData: FormData) {
  const photoId = String(formData.get("photoId") ?? "");
  const next = String(formData.get("next") ?? "/");
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);

  const existing = await prisma.wishlistItem.findUnique({
    where: { userId_photoId: { userId: user!.id, photoId } },
  });

  if (existing) {
    await prisma.wishlistItem.delete({ where: { id: existing.id } });
  } else {
    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
      include: { licenses: { select: { priceVnd: true } } },
    });
    if (photo && photo.status === "LIVE") {
      const minPrice = photo.licenses.length ? Math.min(...photo.licenses.map((l) => l.priceVnd)) : 0;
      await prisma.wishlistItem.create({
        data: { userId: user!.id, photoId, priceAtAdd: minPrice },
      });
    }
  }

  const dest = safeInternalPath(next);
  revalidatePath(dest);
  redirect(dest);
}
