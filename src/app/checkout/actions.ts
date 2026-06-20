"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { splitPrice, fulfillPaidOrder } from "@/lib/commerce";
import { createPaymentUrl, isConfigured } from "@/lib/vnpay";
import { createPaymentUrl as momoCreate, isConfigured as momoConfigured } from "@/lib/momo";
import { createPaymentLink as payosCreate, isConfigured as payosConfigured } from "@/lib/payos";
import { isConfigured as bankConfigured } from "@/lib/bankqr";
import { getSettings, commissionFor } from "@/lib/settings";
import { makeTxnRef, makeOrderCode } from "@/lib/utils";
import { env } from "@/lib/env";

/** Tạo đơn từ giỏ hàng và khởi tạo thanh toán (TT1 -> TT2). */
export async function createOrderAndPayAction(formData: FormData) {
  const user = await requireUser();
  const couponCode = String(formData.get("coupon") ?? "").trim().toUpperCase();
  const provider = String(formData.get("provider") ?? "BANKQR");

  const cart = await prisma.cartItem.findMany({
    where: { userId: user.id },
    include: { photo: { include: { seller: { select: { id: true, sellerTier: true } } } } },
  });
  const valid = cart.filter((c) => c.photo.status === "LIVE" && c.photo.sellerId !== user.id);
  if (valid.length === 0) redirect("/cart?error=Giỏ hàng trống");

  const subtotal = valid.reduce((s, c) => s + c.priceVnd, 0);

  // Coupon (B5)
  let discount = 0;
  let couponId: string | undefined;
  if (couponCode) {
    const coupon = await prisma.coupon.findUnique({ where: { code: couponCode } });
    if (coupon && coupon.active && (!coupon.expiresAt || coupon.expiresAt > new Date())) {
      discount = Math.round((subtotal * coupon.percentOff) / 100);
      couponId = coupon.id;
    }
  }
  const total = Math.max(0, subtotal - discount);

  // PayOS yêu cầu orderCode dạng SỐ; các cổng khác dùng chuỗi PIC...
  // providerTxnRef lưu chuỗi (với PayOS là String(orderCode)) để webhook tra cứu.
  const orderCode = provider === "PAYOS" ? makeOrderCode() : null;
  const txnRef = orderCode === null ? makeTxnRef() : String(orderCode);

  // Tỉ lệ hoa hồng theo tier người bán (AD4) — đọc từ cấu hình admin
  const settings = await getSettings();

  // Tạo đơn + item, tính phí platform theo tier người bán (AD4)
  const order = await prisma.order.create({
    data: {
      buyerId: user.id,
      status: "PENDING",
      subtotalVnd: subtotal,
      discountVnd: discount,
      totalVnd: total,
      platformFeeVnd: 0,
      couponId,
      paymentProvider: provider,
      providerTxnRef: txnRef,
      items: {
        create: valid.map((c) => {
          const { platformFeeVnd, sellerEarningVnd } = splitPrice(
            c.priceVnd,
            commissionFor(c.photo.seller.sellerTier, settings),
          );
          return {
            photoId: c.photoId,
            sellerId: c.photo.sellerId,
            licenseType: c.licenseType,
            sizeLabel: c.sizeLabel,
            priceVnd: c.priceVnd,
            platformFeeVnd,
            sellerEarningVnd,
          };
        }),
      },
    },
    include: { items: true },
  });

  const platformFee = order.items.reduce((s, i) => s + i.platformFeeVnd, 0) - discount;
  await prisma.order.update({
    where: { id: order.id },
    data: { platformFeeVnd: Math.max(0, platformFee) },
  });

  // Xóa giỏ sau khi tạo đơn
  await prisma.cartItem.deleteMany({ where: { userId: user.id } });

  // Đơn miễn phí (coupon 100%) -> hoàn tất luôn
  if (total === 0) {
    await fulfillPaidOrder(order.id, "FREE");
    redirect(`/payment/result?status=success&order=${order.id}`);
  }

  // Chuyển khoản VietQR (SePay) — cổng chính: hiển thị QR, webhook tự xác nhận
  if (provider === "BANKQR" && bankConfigured()) {
    redirect(`/payment/bank?order=${order.id}`);
  }

  // VNPay thật nếu đã cấu hình; nếu chưa -> cổng giả lập cho dev
  if (provider === "VNPAY" && isConfigured()) {
    const h = await headers();
    const ip = (h.get("x-forwarded-for") ?? "127.0.0.1").split(",")[0].trim();
    const payUrl = createPaymentUrl({
      amountVnd: total,
      txnRef,
      orderInfo: `Thanh toan don hang Picseo ${order.id.slice(-8)}`,
      ipAddr: ip,
    });
    await prisma.order.update({ where: { id: order.id }, data: { payUrl } });
    redirect(payUrl);
  }

  // MoMo thật nếu đã cấu hình (gọi API tạo giao dịch)
  if (provider === "MOMO" && momoConfigured()) {
    let payUrl: string | null = null;
    try {
      payUrl = await momoCreate({
        amountVnd: total,
        orderId: txnRef,
        orderInfo: `Thanh toan Picseo ${order.id.slice(-8)}`,
      });
    } catch (e) {
      console.error("MoMo create error:", e);
    }
    if (payUrl) {
      await prisma.order.update({ where: { id: order.id }, data: { payUrl } });
      redirect(payUrl); // redirect ngoài try/catch
    }
    redirect("/checkout?error=Không tạo được giao dịch MoMo, thử lại hoặc đổi cổng");
  }

  // PayOS (VietQR) thật nếu đã cấu hình (gọi API tạo link thanh toán)
  if (provider === "PAYOS" && payosConfigured() && orderCode !== null) {
    let payUrl: string | null = null;
    try {
      payUrl = await payosCreate({
        orderCode,
        amountVnd: total,
        description: `Picseo ${order.id.slice(-8)}`, // <= 25 ký tự
        returnUrl: `${env.appUrl}/api/payment/payos/callback`,
        cancelUrl: `${env.appUrl}/api/payment/payos/callback`,
      });
    } catch (e) {
      console.error("PayOS create error:", e);
    }
    if (payUrl) {
      await prisma.order.update({ where: { id: order.id }, data: { payUrl } });
      redirect(payUrl); // redirect ngoài try/catch
    }
    redirect("/checkout?error=Không tạo được giao dịch PayOS, thử lại hoặc đổi cổng");
  }

  // Fallback: cổng giả lập (chưa cấu hình cổng thật)
  redirect(`/payment/mock?order=${order.id}`);
}
