import "server-only";
import { prisma } from "./prisma";
import { env } from "./env";
import { notify } from "./notifications";
import { randomToken, makeCertNo } from "./utils";

/** Giá đại diện của ảnh = giá license thấp nhất (0 nếu chưa có). */
export function representativePrice(licenses: { priceVnd: number }[]): number {
  return licenses.length ? Math.min(...licenses.map((l) => l.priceVnd)) : 0;
}

/** SW7: nếu chênh lệch giá > 30% so với bên cao hơn, gợi ý bù phần chênh. */
export function computeSuggestedTopUp(offeredPrice: number, requestedPrice: number): number {
  const hi = Math.max(offeredPrice, requestedPrice);
  if (hi === 0) return 0;
  const diff = Math.abs(offeredPrice - requestedPrice);
  return diff / hi > 0.3 ? diff : 0;
}

function makeGrant(buyerId: string, photoId: string, swapOfferId: string) {
  return {
    buyerId,
    photoId,
    source: "SWAP" as const,
    swapOfferId,
    token: randomToken(),
    certNo: makeCertNo(),
    licenseType: "COMMERCIAL" as const,
    sizeLabel: "ORIGINAL",
    expiresAt: new Date(Date.now() + env.rules.downloadLinkHours * 3600 * 1000),
    maxDownloads: env.rules.maxDownloads,
  };
}

/**
 * SW5: hoàn tất swap khi cả hai bên đã ký xác nhận cuối.
 * Cấp quyền tải chéo (A nhận ảnh B yêu cầu, B nhận ảnh A đề nghị), mở khóa 2 ảnh.
 * Idempotent.
 */
export async function completeSwap(offerId: string): Promise<void> {
  const offer = await prisma.swapOffer.findUnique({ where: { id: offerId } });
  if (!offer || offer.status !== "ACCEPTED") return;
  if (!offer.initiatorConfirmed || !offer.responderConfirmed) return;

  await prisma.$transaction(async (tx) => {
    // initiator (A) nhận file ảnh được yêu cầu (của B); responder (B) nhận file ảnh A đề nghị
    await tx.downloadGrant.create({ data: makeGrant(offer.initiatorId, offer.requestedPhotoId, offer.id) });
    await tx.downloadGrant.create({ data: makeGrant(offer.responderId, offer.offeredPhotoId, offer.id) });

    // mở khóa 2 ảnh trở lại LIVE
    await tx.photo.updateMany({
      where: { id: { in: [offer.offeredPhotoId, offer.requestedPhotoId] } },
      data: { status: "LIVE" },
    });

    await tx.swapOffer.update({
      where: { id: offer.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
  });

  // N6: thông báo cả 2 bên
  await Promise.all([
    notify({
      userId: offer.initiatorId,
      type: "SWAP_ACCEPTED",
      title: "Trao đổi hoàn tất",
      body: "Giao dịch trao đổi đã hoàn tất. Bạn có thể tải file và xem certificate trong Thư viện.",
      link: "/library",
      email: true,
    }),
    notify({
      userId: offer.responderId,
      type: "SWAP_ACCEPTED",
      title: "Trao đổi hoàn tất",
      body: "Giao dịch trao đổi đã hoàn tất. Bạn có thể tải file và xem certificate trong Thư viện.",
      link: "/library",
      email: true,
    }),
  ]);
}

/** SW3b: hết hạn 48h cho các đề nghị còn PENDING. */
export async function expireStaleSwaps(): Promise<number> {
  const stale = await prisma.swapOffer.findMany({
    where: { status: "PENDING", expiresAt: { lte: new Date() } },
  });
  for (const s of stale) {
    await prisma.swapOffer.update({ where: { id: s.id }, data: { status: "EXPIRED" } });
    await notify({
      userId: s.initiatorId,
      type: "SWAP_DECLINED",
      title: "Đề nghị trao đổi hết hạn",
      body: "Đề nghị trao đổi của bạn đã hết hạn (48h). Bạn có thể gửi lại hoặc mua thẳng.",
      link: "/swap",
      email: false,
    });
  }
  return stale.length;
}
