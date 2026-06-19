"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getSettings, planPriceFor, planQuotaFor } from "@/lib/settings";
import { createPaymentUrl, isConfigured } from "@/lib/vnpay";
import { makeTxnRef, randomToken, makeCertNo } from "@/lib/utils";
import { signDownloadToken } from "@/lib/download";
import { env } from "@/lib/env";
import {
  ensureFreshQuota,
  canDownloadViaPlan,
  consumeQuota,
  getQuotaState,
} from "@/lib/subscription";
import { notify } from "@/lib/notifications";
import type { PlanType } from "@prisma/client";

/** B7: đăng ký gói. FREE -> hạ gói ngay; PRO/UNLIMITED -> thanh toán. */
export async function subscribeAction(formData: FormData) {
  const user = await requireUser();
  const plan = String(formData.get("plan") ?? "FREE") as PlanType;

  if (plan === "FREE") {
    await prisma.$transaction(async (tx) => {
      await tx.subscription.updateMany({ where: { userId: user.id, status: "ACTIVE" }, data: { status: "CANCELLED" } });
      await tx.user.update({ where: { id: user.id }, data: { planType: "FREE", planRenewsAt: null } });
    });
    redirect("/subscription?downgraded=1");
  }

  const settings = await getSettings();
  const price = planPriceFor(plan, settings);
  const txnRef = makeTxnRef();
  const sub = await prisma.subscription.create({
    data: { userId: user.id, plan, status: "PENDING", priceVnd: price, providerTxnRef: txnRef },
  });

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
  redirect(`/payment/mock?sub=${sub.id}`);
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

/** "Còn quota? -> tải miễn phí": tải ảnh bằng gói thay vì mua lẻ. */
export async function subscriptionDownloadAction(formData: FormData) {
  let user = await requireUser();
  const photoId = String(formData.get("photoId") ?? "");
  const sizeLabel = String(formData.get("sizeLabel") ?? "ORIGINAL");

  user = await ensureFreshQuota(user);
  const settings = await getSettings();
  const limit = planQuotaFor(user.planType, settings);
  if (!canDownloadViaPlan(user, limit)) {
    redirect(`/photos/${photoId}?error=Gói của bạn không còn quota hoặc đã hết hạn`);
  }

  const photo = await prisma.photo.findUnique({ where: { id: photoId } });
  if (!photo || photo.status !== "LIVE") redirect(`/photos/${photoId}?error=Ảnh không khả dụng`);
  if (photo!.sellerId === user.id) redirect(`/photos/${photoId}?error=Đây là ảnh của bạn`);

  // tránh cấp trùng nếu đã có grant subscription cho ảnh này
  const existing = await prisma.downloadGrant.findFirst({
    where: { buyerId: user.id, photoId, source: "SUBSCRIPTION" },
  });

  let grantId: string;
  if (existing) {
    grantId = existing.id;
  } else {
    const grant = await prisma.downloadGrant.create({
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
    grantId = grant.id;
    await consumeQuota(user.id);

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

  const token = await signDownloadToken(grantId);
  redirect(`/api/download?token=${encodeURIComponent(token)}`);
}
