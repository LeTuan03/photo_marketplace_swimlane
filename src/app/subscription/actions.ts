"use server";

import { redirect } from "next/navigation";
import { redirectError } from "@/lib/nav";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getSettings, planPriceFor, planQuotaFor } from "@/lib/settings";
import { createPaymentUrl, isConfigured } from "@/lib/vnpay";
import { createPaymentLink as payosCreate, isConfigured as payosConfigured } from "@/lib/payos";
import { isConfigured as bankConfigured } from "@/lib/bankqr";
import { mockGatewayEnabled } from "@/lib/gateway";
import { makeTxnRef, makeOrderCode, randomToken, makeCertNo } from "@/lib/utils";
import { signDownloadToken } from "@/lib/download";
import { env } from "@/lib/env";
import {
  ensureFreshQuota,
  canDownloadViaPlan,
  getQuotaState,
} from "@/lib/subscription";
import { validSizeLabel } from "@/lib/constants";
import { notify } from "@/lib/notifications";
import type { PlanType } from "@prisma/client";
import type { DownloadResult } from "@/components/DownloadButton";

/** B7: đăng ký gói. FREE -> hạ gói ngay; PRO/UNLIMITED -> thanh toán. */
export async function subscribeAction(formData: FormData) {
  const user = await requireUser();
  const plan = String(formData.get("plan") ?? "FREE") as PlanType;

  if (plan === "FREE") {
    await prisma.$transaction(async (tx) => {
      // Hủy cả sub ACTIVE lẫn PENDING: nếu chỉ hủy ACTIVE, một sub PENDING (đã bấm mua
      // chưa trả tiền) có thể bị webhook kích hoạt MUỘN -> tự nâng cấp lại trái ý người dùng.
      await tx.subscription.updateMany({
        where: { userId: user.id, status: { in: ["ACTIVE", "PENDING"] } },
        data: { status: "CANCELLED" },
      });
      await tx.user.update({ where: { id: user.id }, data: { planType: "FREE", planRenewsAt: null } });
    });
    redirect("/subscription?downgraded=1");
  }

  const settings = await getSettings();
  const price = planPriceFor(plan, settings);

  // Chuyển khoản VietQR (SePay) — cổng chính
  if (bankConfigured()) {
    const txnRef = makeTxnRef();
    const sub = await prisma.subscription.create({
      data: { userId: user.id, plan, status: "PENDING", priceVnd: price, providerTxnRef: txnRef },
    });
    redirect(`/payment/bank?sub=${sub.id}`);
  }

  // PayOS dùng orderCode dạng số; cổng khác dùng chuỗi PIC...
  const orderCode = payosConfigured() ? makeOrderCode() : null;
  const txnRef = orderCode === null ? makeTxnRef() : String(orderCode);
  const sub = await prisma.subscription.create({
    data: { userId: user.id, plan, status: "PENDING", priceVnd: price, providerTxnRef: txnRef },
  });

  // PayOS (VietQR) — cổng chính
  if (orderCode !== null) {
    let payUrl: string | null = null;
    try {
      payUrl = await payosCreate({
        orderCode,
        amountVnd: price,
        description: `Picseo goi ${plan}`, // <= 25 ký tự
        returnUrl: `${env.appUrl}/api/payment/payos/callback`,
        cancelUrl: `${env.appUrl}/api/payment/payos/callback`,
      });
    } catch (e) {
      console.error("PayOS create error:", e);
    }
    if (payUrl) redirect(payUrl); // redirect ngoài try/catch
    redirectError("/subscription?error=Không tạo được giao dịch PayOS, thử lại");
  }

  // VNPay (nếu còn cấu hình) -> nếu không, cổng giả lập
  if (isConfigured()) {
    const h = await headers();
    const ip = (h.get("x-forwarded-for") ?? "127.0.0.1").split(",")[0].trim();
    const payUrl = createPaymentUrl({
      amountVnd: price,
      txnRef,
      orderInfo: `Dang ky goi ${plan} Picseo`,
      ipAddr: ip,
    });
    redirect(payUrl);
  }
  if (mockGatewayEnabled()) {
    redirect(`/payment/mock?sub=${sub.id}`);
  }
  redirectError("/subscription?error=Chưa cấu hình cổng thanh toán, vui lòng liên hệ quản trị");
}

/** Tắt tự gia hạn (giữ hiệu lực tới hết kỳ). */
export async function cancelSubscriptionAction() {
  const user = await requireUser();
  await prisma.subscription.updateMany({
    where: { userId: user.id, status: "ACTIVE" },
    data: { autoRenew: false },
  });
  revalidatePath("/subscription");
  redirect("/subscription?cancelled=1");
}

/**
 * "Còn quota? -> tải miễn phí": tải ảnh bằng gói thay vì mua lẻ.
 * TRẢ url cho client tự kích hoạt tải (không redirect) để nút không kẹt pending —
 * xem giải thích trong components/DownloadButton.tsx.
 */
export async function subscriptionDownloadAction(formData: FormData): Promise<DownloadResult> {
  let user = await requireUser();
  const photoId = String(formData.get("photoId") ?? "");
  const sizeLabel = validSizeLabel(String(formData.get("sizeLabel") ?? "ORIGINAL"));

  user = await ensureFreshQuota(user);
  const settings = await getSettings();
  const limit = planQuotaFor(user.planType, settings);
  if (!canDownloadViaPlan(user, limit)) {
    redirectError(`/photos/${photoId}?error=Gói của bạn không còn quota hoặc đã hết hạn`);
  }

  const photo = await prisma.photo.findUnique({ where: { id: photoId } });
  if (!photo || photo.status !== "LIVE") redirectError(`/photos/${photoId}?error=Ảnh không khả dụng`);
  if (photo!.sellerId === user.id) redirectError(`/photos/${photoId}?error=Đây là ảnh của bạn`);

  // tránh cấp trùng nếu đã có grant subscription cho ảnh này (re-download không tốn quota)
  const existing = await prisma.downloadGrant.findFirst({
    where: { buyerId: user.id, photoId, source: "SUBSCRIPTION" },
  });

  let grantId: string;
  if (existing) {
    // Grant tái dùng có thể đã hết lượt tải -> báo rõ thay vì để /api/download trả 403.
    if (existing.downloadCount >= existing.maxDownloads) {
      return { error: `Ảnh này đã tải tối đa ${existing.maxDownloads} lần.` };
    }
    grantId = existing.id;
  } else {
    // Tiêu thụ quota + tạo grant NGUYÊN TỬ: với gói có giới hạn, chỉ tăng quotaUsed
    // khi quotaUsed < limit. Bắn N request song song cho N ảnh khác nhau không còn
    // vượt được hạn mức (trước đây check rồi mới increment -> race tải vô hạn).
    const newGrantId = await prisma.$transaction(async (tx) => {
      if (limit >= 0) {
        const claimed = await tx.user.updateMany({
          where: { id: user.id, quotaUsed: { lt: limit } },
          data: { quotaUsed: { increment: 1 } },
        });
        if (claimed.count === 0) return null; // hết quota (kể cả do request song song)
      } else {
        await tx.user.update({ where: { id: user.id }, data: { quotaUsed: { increment: 1 } } });
      }
      const grant = await tx.downloadGrant.create({
        data: {
          buyerId: user.id,
          photoId,
          source: "SUBSCRIPTION",
          token: randomToken(),
          certNo: makeCertNo(),
          licenseType: "COMMERCIAL",
          sizeLabel,
          expiresAt: new Date(Date.now() + env.rules.downloadLinkHours * 3600 * 1000),
          maxDownloads: env.rules.maxDownloads,
        },
      });
      return grant.id;
    });

    if (!newGrantId) redirectError(`/photos/${photoId}?error=Gói của bạn không còn quota`);
    grantId = newGrantId!;

    // N11: cảnh báo khi quota gần hết (gói có giới hạn)
    const after = await prisma.user.findUnique({ where: { id: user.id } });
    if (after) {
      const s = getQuotaState(after, limit);
      if (s.limit > 0 && s.remaining <= 2) {
        await notify({
          userId: user.id,
          type: "QUOTA_LOW",
          title: "Quota tải gần hết",
          body: `Bạn còn ${s.remaining} lượt tải trong kỳ này. Cân nhắc nâng gói Unlimited.`,
          link: "/subscription",
          email: false,
        });
      }
    }
  }

  const token = await signDownloadToken(grantId, user.id);
  return { url: `/api/download?token=${encodeURIComponent(token)}` };
}
