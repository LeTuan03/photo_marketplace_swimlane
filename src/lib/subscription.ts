import "server-only";
import { prisma } from "./prisma";
import { notify } from "./notifications";
import { planQuota, PLAN_PERIOD_DAYS, PLAN_LABELS } from "./constants";
import type { User, PlanType } from "@prisma/client";

const PERIOD_MS = PLAN_PERIOD_DAYS * 24 * 3600 * 1000;

export type QuotaState = {
  plan: PlanType;
  isActive: boolean;
  limit: number; // -1 = không giới hạn
  used: number;
  remaining: number; // Infinity nếu unlimited
  resetAt: Date | null;
};

export function getQuotaState(user: User, limitOverride?: number): QuotaState {
  const limit = limitOverride ?? planQuota(user.planType);
  const isActive =
    user.planType !== "FREE" && !!user.planRenewsAt && user.planRenewsAt > new Date();
  const remaining = limit < 0 ? Infinity : Math.max(0, limit - user.quotaUsed);
  return { plan: user.planType, isActive, limit, used: user.quotaUsed, remaining, resetAt: user.quotaResetAt };
}

export function canDownloadViaPlan(user: User, limitOverride?: number): boolean {
  const s = getQuotaState(user, limitOverride);
  return s.isActive && s.remaining > 0;
}

/** Reset quota theo chu kỳ nếu đã qua mốc. Trả về user mới nhất. */
export async function ensureFreshQuota(user: User): Promise<User> {
  // CHỈ reset khi gói còn hiệu lực. Trước đây reset bất kể trạng thái -> một user đã
  // hết hạn (chưa kịp bị cron hạ về FREE) được cấp lại nguyên quota và hiển thị mốc
  // reset sai. Gói hết hạn sẽ do expireDueSubscriptions hạ về FREE.
  const active = user.planType !== "FREE" && !!user.planRenewsAt && user.planRenewsAt > new Date();
  if (active && user.quotaResetAt && user.quotaResetAt <= new Date()) {
    return prisma.user.update({
      where: { id: user.id },
      data: { quotaUsed: 0, quotaResetAt: new Date(Date.now() + PERIOD_MS) },
    });
  }
  return user;
}

/** B7 + TT3: kích hoạt subscription sau khi thanh toán thành công. Idempotent. */
export async function activateSubscription(subId: string, providerTxnId?: string): Promise<void> {
  const sub = await prisma.subscription.findUnique({ where: { id: subId } });
  if (!sub || sub.status === "ACTIVE") return;

  const now = new Date();
  const periodEnd = new Date(now.getTime() + PERIOD_MS);

  // Giành sub nguyên tử (PENDING -> ACTIVE): webhook có thể retry nhiều lần.
  const didActivate = await prisma.$transaction(async (tx) => {
    const claimed = await tx.subscription.updateMany({
      where: { id: sub.id, status: "PENDING" },
      data: { status: "ACTIVE", startedAt: now, currentPeriodEnd: periodEnd },
    });
    if (claimed.count === 0) return false; // đã kích hoạt bởi luồng khác

    // hủy các sub ACTIVE cũ (trừ chính nó)
    await tx.subscription.updateMany({
      where: { userId: sub.userId, status: "ACTIVE", id: { not: sub.id } },
      data: { status: "CANCELLED" },
    });
    await tx.user.update({
      where: { id: sub.userId },
      data: {
        planType: sub.plan,
        planRenewsAt: periodEnd,
        quotaUsed: 0,
        quotaResetAt: periodEnd,
      },
    });
    return true;
  });

  if (!didActivate) return;

  await notify({
    userId: sub.userId,
    type: "SUB_ACTIVATED",
    title: "Kích hoạt gói thành công",
    body: `Bạn đã đăng ký gói ${PLAN_LABELS[sub.plan]}. Gói có hiệu lực tới ${periodEnd.toLocaleDateString("vi-VN")}.`,
    link: "/subscription",
    email: true,
  });
}

/**
 * TT7: gói hết hạn mà không gia hạn (MVP chưa auto-charge) -> hạ về FREE.
 * Trả về số tài khoản bị hạ gói.
 */
export async function expireDueSubscriptions(): Promise<number> {
  const due = await prisma.subscription.findMany({
    where: { status: "ACTIVE", currentPeriodEnd: { lte: new Date() } },
  });
  let count = 0;
  for (const s of due) {
    // Mỗi gói xử lý độc lập: lỗi 1 dòng không làm hỏng cả vòng cron bảo trì.
    try {
      await prisma.$transaction(async (tx) => {
        await tx.subscription.update({ where: { id: s.id }, data: { status: "EXPIRED" } });
        await tx.user.update({
          where: { id: s.userId },
          data: { planType: "FREE", planRenewsAt: null },
        });
      });
      count++;
      await notify({
        userId: s.userId,
        type: "GENERIC",
        title: "Gói đã hết hạn",
        body: "Gói của bạn đã hết hạn và được hạ về Free. Đăng ký lại để tiếp tục tải theo quota.",
        link: "/subscription",
        email: true,
      });
    } catch (err) {
      console.error("expireDueSubscriptions error:", err);
    }
  }
  return count;
}
