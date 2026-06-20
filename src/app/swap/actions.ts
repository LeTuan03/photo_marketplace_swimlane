"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { notify } from "@/lib/notifications";
import { representativePrice, computeSuggestedTopUp, completeSwap } from "@/lib/swap";

const SWAP_WINDOW_MS = 48 * 3600 * 1000;

/** SW1: A gửi đề nghị trao đổi (ảnh A đề nghị <-> ảnh của B). */
export async function createSwapOfferAction(formData: FormData) {
  const user = await requireUser();
  const requestedPhotoId = String(formData.get("requestedPhotoId") ?? "");
  const offeredPhotoId = String(formData.get("offeredPhotoId") ?? "");
  const message = String(formData.get("message") ?? "").slice(0, 500);

  if (!offeredPhotoId) redirect(`/swap/new?target=${requestedPhotoId}&error=Hãy chọn 1 ảnh của bạn để đổi`);

  const [requested, offered] = await Promise.all([
    prisma.photo.findUnique({ where: { id: requestedPhotoId }, include: { licenses: true } }),
    prisma.photo.findUnique({ where: { id: offeredPhotoId }, include: { licenses: true } }),
  ]);

  if (!requested || requested.status !== "LIVE" || !requested.allowSwap) {
    redirect(`/photos/${requestedPhotoId}?error=Ảnh này không nhận trao đổi`);
  }
  if (requested!.sellerId === user.id) redirect(`/photos/${requestedPhotoId}?error=Đây là ảnh của bạn`);
  if (!offered || offered.sellerId !== user.id || offered.status !== "LIVE") {
    redirect(`/swap/new?target=${requestedPhotoId}&error=Ảnh đề nghị không hợp lệ`);
  }

  const topUp = computeSuggestedTopUp(
    representativePrice(offered!.licenses),
    representativePrice(requested!.licenses),
  );

  const offer = await prisma.swapOffer.create({
    data: {
      initiatorId: user.id,
      responderId: requested!.sellerId,
      offeredPhotoId,
      requestedPhotoId,
      message,
      suggestedTopUpVnd: topUp,
      status: "PENDING",
      expiresAt: new Date(Date.now() + SWAP_WINDOW_MS),
    },
  });

  await notify({
    userId: requested!.sellerId,
    type: "SWAP_OFFER",
    title: "Có đề nghị trao đổi ảnh",
    body: `${user.name} muốn đổi ảnh "${offered!.title}" lấy "${requested!.title}". Bạn có 48h để trả lời.`,
    link: "/swap",
    email: true,
  });

  revalidatePath("/swap");
  redirect("/swap?sent=1");
}

/** SW2/SW3 + SW3b: B chấp nhận (khóa 2 ảnh) hoặc từ chối. */
export async function respondSwapAction(formData: FormData) {
  const user = await requireUser();
  const offerId = String(formData.get("offerId") ?? "");
  const decision = String(formData.get("decision") ?? "");

  const offer = await prisma.swapOffer.findUnique({ where: { id: offerId } });
  if (!offer || offer.responderId !== user.id || offer.status !== "PENDING") redirect("/swap");

  const pair = [offer!.offeredPhotoId, offer!.requestedPhotoId];

  if (offer!.expiresAt <= new Date()) {
    await prisma.swapOffer.updateMany({ where: { id: offerId, status: "PENDING" }, data: { status: "EXPIRED" } });
    redirect("/swap?error=Đề nghị đã hết hạn");
  }

  if (decision === "decline") {
    // Chuyển PENDING -> DECLINED NGUYÊN TỬ: nếu luồng khác vừa accept/expire thì count===0.
    const c = await prisma.swapOffer.updateMany({
      where: { id: offerId, status: "PENDING" },
      data: { status: "DECLINED", respondedAt: new Date() },
    });
    if (c.count === 0) redirect("/swap");
    await notify({
      userId: offer!.initiatorId,
      type: "SWAP_DECLINED",
      title: "Đề nghị trao đổi bị từ chối",
      body: "Người nhận đã từ chối đề nghị. Bạn có thể đề nghị ảnh khác hoặc mua thẳng.",
      link: "/swap",
      email: false,
    });
    revalidatePath("/swap");
    redirect("/swap");
  }

  // Accept: "giành" đề nghị (PENDING -> ACCEPTED) rồi khóa 2 ảnh CHỈ khi cả hai còn LIVE.
  // Tất cả trong 1 transaction nguyên tử: nếu không khóa đủ 2 ảnh (một ảnh đã bán/khóa/
  // gỡ) thì ném lỗi để rollback toàn bộ -> không có chuyện đề nghị ACCEPTED mà ảnh chưa khóa.
  const ok = await prisma.$transaction(async (tx) => {
    const claimed = await tx.swapOffer.updateMany({
      where: { id: offerId, status: "PENDING" },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    });
    if (claimed.count === 0) return false; // luồng khác đã xử lý

    const locked = await tx.photo.updateMany({
      where: { id: { in: pair }, status: "LIVE" },
      data: { status: "LOCKED" },
    });
    if (locked.count !== 2) throw new Error("PHOTO_UNAVAILABLE"); // rollback

    // hủy các đề nghị PENDING khác liên quan tới 2 ảnh này
    await tx.swapOffer.updateMany({
      where: {
        id: { not: offerId },
        status: "PENDING",
        OR: [
          { offeredPhotoId: { in: pair } },
          { requestedPhotoId: { in: pair } },
        ],
      },
      data: { status: "DECLINED" },
    });
    return true;
  }).catch((e) => {
    if (e instanceof Error && e.message === "PHOTO_UNAVAILABLE") return "unavailable" as const;
    throw e;
  });

  if (ok === false) redirect("/swap");
  if (ok === "unavailable") redirect("/swap?error=Một trong hai ảnh không còn khả dụng");

  await notify({
    userId: offer!.initiatorId,
    type: "SWAP_ACCEPTED",
    title: "Đề nghị trao đổi được chấp nhận",
    body: "Hai ảnh đã được khóa. Vui lòng vào trang Trao đổi để xác nhận cuối cùng.",
    link: "/swap",
    email: true,
  });

  revalidatePath("/swap");
  redirect("/swap");
}

/** SW4: mỗi bên ký xác nhận cuối; khi đủ cả 2 -> hoàn tất (SW5). */
export async function confirmSwapAction(formData: FormData) {
  const user = await requireUser();
  const offerId = String(formData.get("offerId") ?? "");
  const offer = await prisma.swapOffer.findUnique({ where: { id: offerId } });
  if (!offer || offer.status !== "ACCEPTED") redirect("/swap");

  const isInitiator = offer!.initiatorId === user.id;
  const isResponder = offer!.responderId === user.id;
  if (!isInitiator && !isResponder) redirect("/swap");

  await prisma.swapOffer.update({
    where: { id: offerId },
    data: isInitiator ? { initiatorConfirmed: true } : { responderConfirmed: true },
  });

  const fresh = await prisma.swapOffer.findUnique({ where: { id: offerId } });
  if (fresh!.initiatorConfirmed && fresh!.responderConfirmed) {
    await completeSwap(offerId);
  }

  revalidatePath("/swap");
  redirect("/swap");
}

/** SW6: một bên huỷ. Nếu đã ACCEPTED (đã khóa) thì mở khóa lại 2 ảnh. */
export async function cancelSwapAction(formData: FormData) {
  const user = await requireUser();
  const offerId = String(formData.get("offerId") ?? "");
  const reason = String(formData.get("reason") ?? "").slice(0, 300);
  const offer = await prisma.swapOffer.findUnique({ where: { id: offerId } });
  if (!offer) redirect("/swap");

  const isParty = offer!.initiatorId === user.id || offer!.responderId === user.id;
  if (!isParty || (offer!.status !== "PENDING" && offer!.status !== "ACCEPTED")) redirect("/swap");

  await prisma.$transaction(async (tx) => {
    if (offer!.status === "ACCEPTED") {
      await tx.photo.updateMany({
        where: { id: { in: [offer!.offeredPhotoId, offer!.requestedPhotoId] }, status: "LOCKED" },
        data: { status: "LIVE" },
      });
    }
    await tx.swapOffer.update({
      where: { id: offerId },
      data: { status: "CANCELLED", cancelReason: reason || "Một bên huỷ giao dịch" },
    });
  });

  const otherId = offer!.initiatorId === user.id ? offer!.responderId : offer!.initiatorId;
  await notify({
    userId: otherId,
    type: "SWAP_DECLINED",
    title: "Giao dịch trao đổi đã huỷ",
    body: `Đối tác đã huỷ giao dịch trao đổi.${reason ? ` Lý do: ${reason}` : ""}`,
    link: "/swap",
    email: false,
  });

  revalidatePath("/swap");
  redirect("/swap");
}
