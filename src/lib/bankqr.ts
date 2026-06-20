import "server-only";
import crypto from "node:crypto";
import { env } from "./env";

/**
 * Thanh toán bằng CHUYỂN KHOẢN VietQR + giám sát biến động số dư (SePay/Casso).
 * Luồng: tạo QR có nội dung = mã đơn (PIC...), người mua quét & chuyển khoản,
 * SePay đọc tiền vào tài khoản rồi gọi webhook -> ta khớp memo + số tiền -> xác nhận.
 * Không cần hợp đồng doanh nghiệp, chỉ cần liên kết tài khoản NH với SePay.
 */

export function isConfigured(): boolean {
  return Boolean(env.bank.bankId && env.bank.account && env.bank.accountName);
}

export function bankInfo() {
  return {
    bankId: env.bank.bankId,
    account: env.bank.account,
    accountName: env.bank.accountName,
  };
}

/** URL ảnh VietQR (SePay) đã nhúng sẵn số tiền + nội dung chuyển khoản. */
export function buildQrUrl(args: { amountVnd: number; memo: string }): string {
  const p = new URLSearchParams({
    acc: env.bank.account,
    bank: env.bank.bankId,
    amount: String(Math.round(args.amountVnd)),
    des: args.memo,
  });
  return `${env.bank.qrUrl}?${p.toString()}`;
}

/**
 * Trích mã giao dịch PIC... từ nội dung chuyển khoản do ngân hàng ghi nhận.
 * Chuẩn hóa (in hoa, bỏ ký tự không phải chữ-số) rồi bắt token bắt đầu bằng PIC.
 */
export function extractTxnRef(content: string): string | null {
  const norm = (content || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = norm.match(/PIC[0-9A-Z]+/);
  return m ? m[0] : null;
}

/** Xác thực webhook SePay qua header `Authorization: Apikey <key>` (so sánh hằng thời gian). */
export function verifyWebhookAuth(authHeader: string | null): boolean {
  const expected = env.bank.sepayApiKey;
  if (!expected) return true; // chưa đặt key -> chấp nhận (chỉ nên dùng khi dev)
  if (!authHeader) return false;
  const token = authHeader.replace(/^Apikey\s+/i, "").trim();
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
