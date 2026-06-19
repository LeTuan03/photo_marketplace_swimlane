"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { storage, keyFor } from "@/lib/storage";
import { readMeta, makeWatermarkedPreview, makeThumb } from "@/lib/image";
import { notifyAdmins, notify } from "@/lib/notifications";
import { formatVnd } from "@/lib/money";
import { parseTags, payoutSchema } from "@/lib/validation";
import { env } from "@/lib/env";
import { LICENSE_ORDER } from "@/lib/constants";
import type { LicenseType } from "@prisma/client";

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_BATCH = 10;
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

  const files = formData
    .getAll("file")
    .filter((x): x is File => x instanceof File && x.size > 0);
  if (files.length === 0) redirect("/seller/upload?error=Vui lòng chọn file ảnh");
  if (files.length > MAX_BATCH) redirect(`/seller/upload?error=Tối đa ${MAX_BATCH} ảnh mỗi lần`);

  const licenses = collectLicenses(formData);
  if (licenses.length === 0) redirect("/seller/upload?error=Chọn ít nhất 1 loại license và đặt giá > 0");

  // Metadata dùng chung cho cả batch
  const baseTitle = String(formData.get("title") ?? "").trim().slice(0, 120);
  const single = files.length === 1;
  if (single && baseTitle && baseTitle.length < 3) {
    redirect("/seller/upload?error=Tiêu đề tối thiểu 3 ký tự");
  }
  const description = String(formData.get("description") ?? "").slice(0, 2000);
  const tags = parseTags(String(formData.get("tags") ?? ""));
  const hasModelRelease = formData.get("hasModelRelease") === "on";
  const allowSwap = formData.get("allowSwap") === "on";
  const categorySlug = String(formData.get("categorySlug") ?? "");
  const category = categorySlug
    ? await prisma.category.findUnique({ where: { slug: categorySlug } })
    : null;

  const titleFor = (f: File, i: number): string => {
    if (single && baseTitle) return baseTitle;
    if (baseTitle) return `${baseTitle} ${i + 1}`;
    const fromName = f.name.replace(/\.[^.]+$/, "").trim().slice(0, 120);
    return fromName.length >= 3 ? fromName : `Ảnh chưa đặt tên ${i + 1}`;
  };

  let created = 0;
  let skipped = 0;

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (f.size > MAX_BYTES || !ACCEPTED.includes(f.type)) {
      skipped++;
      continue;
    }
    const buffer = Buffer.from(await f.arrayBuffer());
    let imgMeta;
    try {
      imgMeta = await readMeta(buffer);
    } catch {
      skipped++;
      continue;
    }
    const ext = f.type === "image/png" ? "png" : f.type === "image/webp" ? "webp" : "jpg";

    const photo = await prisma.photo.create({
      data: {
        sellerId: user.id,
        title: titleFor(f, i),
        description,
        categoryId: category?.id,
        tags,
        status: "PENDING",
        hasModelRelease,
        allowSwap,
        width: imgMeta.width,
        height: imgMeta.height,
        sizeBytes: imgMeta.sizeBytes,
        format: imgMeta.format,
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
      await prisma.photo.update({
        where: { id: photo.id },
        data: { originalKey: oKey, previewKey: pKey, thumbKey: tKey },
      });
      created++;
    } catch (e) {
      await prisma.photo.delete({ where: { id: photo.id } });
      console.error("upload xử lý ảnh lỗi:", e);
      skipped++;
    }
  }

  if (created === 0) redirect("/seller/upload?error=Không tải lên được ảnh nào (sai định dạng hoặc lỗi xử lý)");

  await notifyAdmins(
    "Ảnh mới chờ duyệt",
    `${created} ảnh vừa được ${user.name} tải lên.`,
    "/admin/review",
  );

  redirect(`/seller/inventory?uploaded=${created}${skipped ? `&skipped=${skipped}` : ""}`);
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

  // B12: nếu giá thấp nhất giảm -> báo người đã thêm vào wishlist
  if (licenses.length > 0) {
    const newMin = Math.min(...licenses.map((l) => l.priceVnd));
    const watchers = await prisma.wishlistItem.findMany({
      where: { photoId, priceAtAdd: { gt: newMin } },
    });
    for (const w of watchers) {
      await notify({
        userId: w.userId,
        type: "PRICE_DROP",
        title: "Ảnh trong wishlist giảm giá",
        body: `"${photo!.title}" đã giảm giá còn từ ${formatVnd(newMin)} (trước đó ${formatVnd(w.priceAtAdd)}).`,
        link: `/photos/${photoId}`,
        email: false,
      });
      await prisma.wishlistItem.update({ where: { id: w.id }, data: { priceAtAdd: newMin } });
    }
  }

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

/** S10b: người bán gửi phản biện (counter-claim) cho khiếu nại DMCA. */
export async function submitCounterClaimAction(formData: FormData) {
  const user = await requireRole("SELLER", "ADMIN");
  const claimId = String(formData.get("claimId") ?? "");
  const statement = String(formData.get("statement") ?? "").slice(0, 1000);
  if (!statement) redirect("/seller/inventory?error=Vui lòng nhập nội dung phản biện");

  const claim = await prisma.dmcaClaim.findUnique({
    where: { id: claimId },
    include: { photo: { select: { sellerId: true, title: true } } },
  });
  if (!claim || claim.status !== "OPEN") redirect("/seller/inventory");
  if (claim!.photo.sellerId !== user.id && user.role !== "ADMIN") redirect("/seller/inventory");

  await prisma.dmcaClaim.update({
    where: { id: claimId },
    data: { status: "COUNTERED", counterStatement: statement, counteredAt: new Date() },
  });
  await notifyAdmins(
    "Phản biện DMCA cần xét",
    `Người bán đã phản biện khiếu nại với ảnh "${claim!.photo.title}".`,
    "/admin/dmca",
  );
  revalidatePath("/seller/inventory");
  redirect("/seller/inventory?countered=1");
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
