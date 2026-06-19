"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { storage, keyFor } from "@/lib/storage";
import { readMeta, makeWatermarkedPreview, makeThumb } from "@/lib/image";
import { notifyAdmins } from "@/lib/notifications";
import { photoMetaSchema, parseTags, payoutSchema } from "@/lib/validation";
import { env } from "@/lib/env";
import { LICENSE_ORDER } from "@/lib/constants";
import type { LicenseType } from "@prisma/client";

const MAX_BYTES = 50 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

function collectLicenses(formData: FormData) {
  const out: { type: LicenseType; priceVnd: number }[] = [];
  for (const type of LICENSE_ORDER) {
    if (formData.get(`on_${type}`) === "on") {
      const price = parseInt(String(formData.get(`price_${type}`) ?? "0"), 10);
      if (Number.isFinite(price) && price > 0) out.push({ type, priceVnd: price });
    }
  }
  return out;
}

/** S2-S4: Upload ảnh + metadata + license/giá -> tạo bản ghi PENDING chờ duyệt. */
export async function uploadPhotoAction(formData: FormData) {
  const user = await requireRole("SELLER", "ADMIN");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) redirect("/seller/upload?error=Vui lòng chọn file ảnh");
  const f = file as File;
  if (f.size > MAX_BYTES) redirect("/seller/upload?error=File vượt quá 50MB");
  if (!ACCEPTED.includes(f.type)) redirect("/seller/upload?error=Chỉ chấp nhận JPG, PNG, WEBP");

  const meta = photoMetaSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    categorySlug: formData.get("categorySlug") ?? undefined,
    tags: formData.get("tags") ?? "",
    hasModelRelease: formData.get("hasModelRelease") === "on",
    allowSwap: formData.get("allowSwap") === "on",
  });
  if (!meta.success) redirect(`/seller/upload?error=${encodeURIComponent(meta.error.issues[0].message)}`);

  const licenses = collectLicenses(formData);
  if (licenses.length === 0) redirect("/seller/upload?error=Chọn ít nhất 1 loại license và đặt giá > 0");

  const buffer = Buffer.from(await f.arrayBuffer());
  let imgMeta;
  try {
    imgMeta = await readMeta(buffer);
  } catch {
    redirect("/seller/upload?error=File ảnh không hợp lệ");
  }

  const category = meta.data.categorySlug
    ? await prisma.category.findUnique({ where: { slug: meta.data.categorySlug } })
    : null;

  const ext = f.type === "image/png" ? "png" : f.type === "image/webp" ? "webp" : "jpg";

  const photo = await prisma.photo.create({
    data: {
      sellerId: user.id,
      title: meta.data.title,
      description: meta.data.description,
      categoryId: category?.id,
      tags: parseTags(meta.data.tags),
      status: "PENDING",
      hasModelRelease: meta.data.hasModelRelease,
      allowSwap: meta.data.allowSwap,
      width: imgMeta!.width,
      height: imgMeta!.height,
      sizeBytes: imgMeta!.sizeBytes,
      format: imgMeta!.format,
      originalKey: "",
      previewKey: "",
      thumbKey: "",
      licenses: { create: licenses },
    },
  });

  const oKey = keyFor.original(photo.id, ext);
  const pKey = keyFor.preview(photo.id);
  const tKey = keyFor.thumb(photo.id);
  try {
    const [preview, thumb] = await Promise.all([makeWatermarkedPreview(buffer), makeThumb(buffer)]);
    await Promise.all([
      storage().put(oKey, buffer, f.type),
      storage().put(pKey, preview, "image/webp"),
      storage().put(tKey, thumb, "image/webp"),
    ]);
  } catch (e) {
    await prisma.photo.delete({ where: { id: photo.id } });
    console.error("upload xử lý ảnh lỗi:", e);
    redirect("/seller/upload?error=Lỗi xử lý ảnh, vui lòng thử lại");
  }

  await prisma.photo.update({
    where: { id: photo.id },
    data: { originalKey: oKey, previewKey: pKey, thumbKey: tKey },
  });

  await notifyAdmins("Ảnh mới chờ duyệt", `"${meta.data.title}" vừa được tải lên.`, "/admin/review");

  redirect("/seller/inventory?uploaded=1");
}

/** S6: cập nhật giá/tag/mô tả ảnh đang live. */
export async function updatePhotoAction(formData: FormData) {
  const user = await requireRole("SELLER", "ADMIN");
  const photoId = String(formData.get("photoId") ?? "");
  const photo = await prisma.photo.findUnique({ where: { id: photoId } });
  if (!photo || (photo.sellerId !== user.id && user.role !== "ADMIN")) redirect("/seller/inventory");

  const tags = parseTags(String(formData.get("tags") ?? ""));
  const description = String(formData.get("description") ?? "").slice(0, 2000);
  const licenses = collectLicenses(formData);

  await prisma.$transaction(async (tx) => {
    await tx.photo.update({ where: { id: photoId }, data: { tags, description } });
    if (licenses.length > 0) {
      await tx.licenseOption.deleteMany({ where: { photoId } });
      await tx.licenseOption.createMany({
        data: licenses.map((l) => ({ photoId, type: l.type, priceVnd: l.priceVnd })),
      });
    }
  });

  revalidatePath("/seller/inventory");
  redirect("/seller/inventory?updated=1");
}

/** S7: ẩn / hiện lại ảnh. */
export async function togglePhotoVisibilityAction(formData: FormData) {
  const user = await requireRole("SELLER", "ADMIN");
  const photoId = String(formData.get("photoId") ?? "");
  const photo = await prisma.photo.findUnique({ where: { id: photoId } });
  if (!photo || (photo.sellerId !== user.id && user.role !== "ADMIN")) redirect("/seller/inventory");

  if (photo.status === "LIVE") {
    await prisma.photo.update({ where: { id: photoId }, data: { status: "HIDDEN" } });
  } else if (photo.status === "HIDDEN") {
    await prisma.photo.update({ where: { id: photoId }, data: { status: "LIVE" } });
  }
  revalidatePath("/seller/inventory");
  redirect("/seller/inventory");
}

/** S7: xoá ảnh (giữ lịch sử giao dịch — chuyển REMOVED, gỡ preview). */
export async function deletePhotoAction(formData: FormData) {
  const user = await requireRole("SELLER", "ADMIN");
  const photoId = String(formData.get("photoId") ?? "");
  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
    include: { _count: { select: { orderItems: true } } },
  });
  if (!photo || (photo.sellerId !== user.id && user.role !== "ADMIN")) redirect("/seller/inventory");

  if (photo._count.orderItems > 0) {
    // đã có giao dịch -> chỉ gỡ khỏi marketplace, giữ lịch sử
    await prisma.photo.update({ where: { id: photoId }, data: { status: "REMOVED" } });
  } else {
    await Promise.all([
      storage().delete(photo.originalKey),
      storage().delete(photo.previewKey),
      storage().delete(photo.thumbKey),
    ]);
    await prisma.photo.delete({ where: { id: photoId } });
  }
  revalidatePath("/seller/inventory");
  redirect("/seller/inventory");
}

/** S5b: sửa & gửi lại ảnh bị từ chối -> quay lại hàng chờ duyệt. */
export async function resubmitPhotoAction(formData: FormData) {
  const user = await requireRole("SELLER", "ADMIN");
  const photoId = String(formData.get("photoId") ?? "");
  const photo = await prisma.photo.findUnique({ where: { id: photoId } });
  if (!photo || photo.sellerId !== user.id) redirect("/seller/inventory");
  if (photo.status !== "REJECTED") redirect("/seller/inventory");

  await prisma.photo.update({
    where: { id: photoId },
    data: { status: "PENDING", rejectionReason: null },
  });
  await notifyAdmins("Ảnh gửi lại chờ duyệt", `"${photo.title}" đã được sửa và gửi lại.`, "/admin/review");
  revalidatePath("/seller/inventory");
  redirect("/seller/inventory?resubmitted=1");
}

/** S9 / TT6: người bán yêu cầu rút tiền. */
export async function requestPayoutAction(formData: FormData) {
  const user = await requireRole("SELLER", "ADMIN");
  const parsed = payoutSchema.safeParse({
    amountVnd: formData.get("amountVnd"),
    method: formData.get("method"),
    destination: formData.get("destination"),
  });
  if (!parsed.success) redirect(`/seller/earnings?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  const { amountVnd, method, destination } = parsed.data;

  if (amountVnd < env.rules.minPayoutVnd) {
    redirect(`/seller/earnings?error=Số tiền rút tối thiểu là ${env.rules.minPayoutVnd.toLocaleString("vi-VN")}đ`);
  }
  if (user.kycStatus !== "VERIFIED") {
    redirect("/seller/earnings?error=Cần xác minh danh tính (KYC) trước khi rút tiền");
  }

  await prisma.$transaction(async (tx) => {
    const fresh = await tx.user.findUnique({ where: { id: user.id } });
    if (!fresh || fresh.balanceVnd < amountVnd) {
      redirect("/seller/earnings?error=Số dư không đủ");
    }
    const after = fresh!.balanceVnd - amountVnd;
    await tx.user.update({ where: { id: user.id }, data: { balanceVnd: after } });
    await tx.payout.create({
      data: { sellerId: user.id, amountVnd, method, destination, status: "REQUESTED" },
    });
    await tx.walletTransaction.create({
      data: {
        userId: user.id,
        type: "PAYOUT",
        amountVnd: -amountVnd,
        balanceAfterVnd: after,
        note: `Yêu cầu rút tiền qua ${method}`,
      },
    });
  });

  redirect("/seller/earnings?payout=1");
}
