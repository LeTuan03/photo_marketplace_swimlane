"use server";

import { redirect } from "next/navigation";
import { redirectError } from "@/lib/nav";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { splitPrice, fulfillPaidOrder } from "@/lib/commerce";
import { createPaymentUrl, isConfigured } from "@/lib/vnpay";
import { createPaymentUrl as momoCreate, isConfigured as momoConfigured } from "@/lib/momo";
import { createPaymentLink as payosCreate, isConfigured as payosConfigured } from "@/lib/payos";
import { isConfigured as bankConfigured } from "@/lib/bankqr";
import { mockGatewayEnabled } from "@/lib/gateway";
import { getSettings, commissionFor } from "@/lib/settings";
import { makeTxnRef, makeOrderCode } from "@/lib/utils";
import { env } from "@/lib/env";

/** Tạo đơn từ giỏ hàng và khởi tạo thanh toán (TT1 -> TT2). */
export async function createOrderAndPayAction(formData: FormData) {
  const user = await requireUser();
  const couponCode = String(formData.get("coupon") ?? "").trim().toUpperCase();
  const provider = String(formData.get("provider") ?? "BANKQR");

  // Người mua phải cam kết dùng đúng phạm vi license (đối chiếu được qua certificate ở /verify).
  if (formData.get("agreeLicense") !== "1") {
    redirectError("/checkout?error=Vui lòng xác nhận cam kết sử dụng ảnh đúng phạm vi license");
  }

  const cart = await prisma.cartItem.findMany({
    where: { userId: user.id },
    include: {
      photo: { include: { seller: { select: { id: true, sellerTier: true } }, licenses: true } },
    },
  });

  // Tỉ lệ hoa hồng theo tier người bán (AD4) — đọc từ cấu hình admin
  const settings = await getSettings();

  // Các license người mua đã sở hữu (grant còn quyền tải) — để bỏ qua, chống mua trùng.
  const ownedGrants = await prisma.downloadGrant.findMany({
    where: { buyerId: user.id, photoId: { in: cart.map((c) => c.photoId) }, maxDownloads: { gt: 0 } },
    select: { photoId: true, licenseType: true },
  });
  const ownedSet = new Set(ownedGrants.map((g) => `${g.photoId}:${g.licenseType}`));

  // Dựng item kèm GIÁ HIỆN TẠI của license (KHÔNG tin priceVnd cũ lưu trong giỏ — người
  // bán có thể đã đổi giá). Loại item: ảnh không LIVE / của chính mình / license đã bị gỡ
  // hoặc giá <= 0 / đã sở hữu trước đó.
  const lineItems = cart.flatMap((c) => {
    if (c.photo.status !== "LIVE" || c.photo.sellerId === user.id) return [];
    if (ownedSet.has(`${c.photoId}:${c.licenseType}`)) return [];
    const license = c.photo.licenses.find((l) => l.type === c.licenseType);
    if (!license || license.priceVnd <= 0) return [];
    const { platformFeeVnd, sellerEarningVnd } = splitPrice(
      license.priceVnd,
      commissionFor(c.photo.seller.sellerTier, settings),
    );
    return [{
      photoId: c.photoId,
      sellerId: c.photo.sellerId,
      licenseType: c.licenseType,
      sizeLabel: c.sizeLabel,
      priceVnd: license.priceVnd,
      platformFeeVnd,
      sellerEarningVnd,
    }];
  });
  if (lineItems.length === 0) redirectError("/cart?error=Không có sản phẩm hợp lệ để thanh toán");

  const subtotal = lineItems.reduce((s, i) => s + i.priceVnd, 0);
  const totalPlatformFee = lineItems.reduce((s, i) => s + i.platformFeeVnd, 0);

  // Coupon (B5) — mỗi người dùng chỉ áp dụng MỘT lần để chống lạm dụng mã giảm giá
  // (đặc biệt mã 100% -> đơn 0đ fulfill miễn phí). Nếu đã từng dùng -> bỏ qua giảm giá.
  let discount = 0;
  let couponId: string | undefined;
  if (couponCode) {
    const coupon = await prisma.coupon.findUnique({ where: { code: couponCode } });
    if (coupon && coupon.active && (!coupon.expiresAt || coupon.expiresAt > new Date())) {
      const usedBefore = await prisma.order.findFirst({
        where: { buyerId: user.id, couponId: coupon.id, status: { in: ["PENDING", "PAID"] } },
        select: { id: true },
      });
      if (usedBefore) {
        redirectError("/cart?error=Bạn đã sử dụng mã giảm giá này rồi");
      }
      discount = Math.round((subtotal * coupon.percentOff) / 100);
      couponId = coupon.id;
    }
  }
  // Coupon do SÀN tài trợ: người bán luôn nhận ĐỦ earning, nên không cho giảm sâu hơn tổng
  // phí sàn — nếu không, phí sàn âm = sàn bù tiền túi. Kẹp giảm giá ở mức tổng phí sàn.
  discount = Math.min(discount, totalPlatformFee);
  const total = Math.max(0, subtotal - discount);
  const platformFeeVnd = totalPlatformFee - discount; // luôn >= 0 sau khi kẹp

  // PayOS yêu cầu orderCode dạng SỐ; các cổng khác dùng chuỗi PIC...
  // providerTxnRef lưu chuỗi (với PayOS là String(orderCode)) để webhook tra cứu.
  const orderCode = provider === "PAYOS" ? makeOrderCode() : null;
  const txnRef = orderCode === null ? makeTxnRef() : String(orderCode);

  // Tạo đơn + item (phí sàn đã tính sẵn, không cần update lại sau khi tạo)
  const order = await prisma.order.create({
    data: {
      buyerId: user.id,
      status: "PENDING",
      subtotalVnd: subtotal,
      discountVnd: discount,
      totalVnd: total,
      platformFeeVnd,
      couponId,
      paymentProvider: provider,
      providerTxnRef: txnRef,
      items: { create: lineItems },
    },
  });

  // Xóa giỏ sau khi tạo đơn
  await prisma.cartItem.deleteMany({ where: { userId: user.id } });

  // An toàn: nếu tổng về 0đ (sau khi kẹp giảm giá, thực tế không xảy ra vì discount đã
  // bị giới hạn ở mức phí sàn < subtotal) thì hoàn tất luôn, không qua cổng.
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
    // Tạo link thất bại -> đánh dấu FAILED để không để đơn PENDING mồ côi (giỏ đã xóa).
    await prisma.order.updateMany({ where: { id: order.id, status: "PENDING" }, data: { status: "FAILED" } });
    redirectError("/checkout?error=Không tạo được giao dịch MoMo, thử lại hoặc đổi cổng");
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
    await prisma.order.updateMany({ where: { id: order.id, status: "PENDING" }, data: { status: "FAILED" } });
    redirectError("/checkout?error=Không tạo được giao dịch PayOS, thử lại hoặc đổi cổng");
  }

  // Fallback: cổng giả lập — CHỈ khi không có cổng thật & không phải production.
  if (mockGatewayEnabled()) {
    redirect(`/payment/mock?order=${order.id}`);
  }
  // Không có cổng khả dụng (vd: provider được chọn chưa cấu hình & prod) -> không để
  // đơn PENDING mồ côi.
  await prisma.order.updateMany({ where: { id: order.id, status: "PENDING" }, data: { status: "FAILED" } });
  redirectError("/checkout?error=Chưa cấu hình cổng thanh toán, vui lòng liên hệ quản trị");
}
