import "server-only";
import { prisma } from "./prisma";
import { notify } from "./notifications";

export const DMCA_WINDOW_DAYS = 7;

/** Chấp nhận khiếu nại: gỡ ảnh vĩnh viễn + cảnh báo/phạt người bán (AD7). */
export async function upholdDmcaClaim(claimId: string, resolution: string): Promise<void> {
  const claim = await prisma.dmcaClaim.findUnique({
    where: { id: claimId },
    include: { photo: { select: { id: true, sellerId: true, title: true } } },
  });
  if (!claim || (claim.status !== "OPEN" && claim.status !== "COUNTERED")) return;

  await prisma.$transaction(async (tx) => {
    await tx.dmcaClaim.update({
      where: { id: claim.id },
      data: { status: "RESOLVED_REMOVED", resolvedAt: new Date(), resolution },
    });
    await tx.photo.update({ where: { id: claim.photoId }, data: { status: "REMOVED" } });
    await tx.user.update({
      where: { id: claim.photo.sellerId },
      data: { penaltyPoints: { increment: 1 } },
    });
  });

  await notify({
    userId: claim.photo.sellerId,
    type: "DMCA",
    title: "Ảnh bị gỡ do khiếu nại bản quyền",
    body: `"${claim.photo.title}" đã bị gỡ vĩnh viễn sau khiếu nại DMCA. ${resolution} Tài khoản của bạn bị ghi nhận 1 điểm vi phạm.`,
    link: "/seller/inventory",
    email: true,
  });
  await notify({
    userId: claim.claimantId,
    type: "DMCA",
    title: "Khiếu nại DMCA được chấp nhận",
    body: `Khiếu nại của bạn với ảnh "${claim.photo.title}" đã được xử lý: ảnh đã bị gỡ.`,
    email: true,
  });
}

/** Bác khiếu nại: khôi phục ảnh về LIVE. */
export async function restoreDmcaClaim(claimId: string, resolution: string): Promise<void> {
  const claim = await prisma.dmcaClaim.findUnique({
    where: { id: claimId },
    include: { photo: { select: { id: true, sellerId: true, title: true } } },
  });
  if (!claim || (claim.status !== "OPEN" && claim.status !== "COUNTERED")) return;

  await prisma.$transaction(async (tx) => {
    await tx.dmcaClaim.update({
      where: { id: claim.id },
      data: { status: "RESOLVED_RESTORED", resolvedAt: new Date(), resolution },
    });
    // CHỈ khôi phục về LIVE khi ảnh đang ở DMCA_HOLD. Tránh "hồi sinh" ảnh đã bị
    // REMOVED do nguyên nhân khác, hoặc ghi đè trạng thái LOCKED (đang trong swap).
    await tx.photo.updateMany({
      where: { id: claim.photoId, status: "DMCA_HOLD" },
      data: { status: "LIVE" },
    });
  });

  await notify({
    userId: claim.photo.sellerId,
    type: "DMCA",
    title: "Ảnh được khôi phục",
    body: `Khiếu nại DMCA với "${claim.photo.title}" đã bị bác. Ảnh đã hiển thị trở lại.`,
    link: "/seller/inventory",
    email: true,
  });
  await notify({
    userId: claim.claimantId,
    type: "DMCA",
    title: "Khiếu nại DMCA bị bác",
    body: `Khiếu nại của bạn với ảnh "${claim.photo.title}" không được chấp nhận sau khi xem xét.`,
    email: false,
  });
}

/** S10b: hết 7 ngày không phản biện -> gỡ ảnh vĩnh viễn. */
export async function expireDueDmca(): Promise<number> {
  const due = await prisma.dmcaClaim.findMany({
    where: { status: "OPEN", deadline: { lte: new Date() } },
    select: { id: true },
  });
  let count = 0;
  for (const c of due) {
    // Mỗi claim độc lập: lỗi 1 dòng không làm hỏng cả vòng cron bảo trì.
    try {
      await upholdDmcaClaim(c.id, "Hết 7 ngày không có phản biện.");
      count++;
    } catch (err) {
      console.error("expireDueDmca error:", err);
    }
  }
  return count;
}
