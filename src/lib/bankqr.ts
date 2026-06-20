import "server-only";
import crypto from "node:crypto";
import { env } from "./env";

/**
 * Thanh toán CHUYỂN KHOẢN bằng mã QR tài khoản ngân hàng.
 * Xác nhận THỦ CÔNG: admin đối chiếu biến động số dư rồi bấm xác nhận ở /admin/payments.
 * QR có 2 cách: (1) ảnh QR tĩnh của tài khoản (BANK_QR_IMAGE) — đúng nghĩa "ảnh QR TK";
 * (2) VietQR động (vietqr.io) tự điền sẵn số tiền + nội dung khi chưa có ảnh tĩnh.
 * (verifyWebhookAuth/extractTxnRef giữ lại để hỗ trợ tự xác nhận qua SePay nếu sau này bật.)
 */

export function isConfigured(): boolean {
  // Cần tối thiểu số TK + tên chủ TK để hiển thị; QR có thể là ảnh tĩnh hoặc động.
  return Boolean(env.bank.account && env.bank.accountName);
}

export function bankInfo() {
  return {
    bankId: env.bank.bankId,
    account: env.bank.account,
    accountName: env.bank.accountName,
  };
}

export type ResolvedQr = { url: string; isStatic: boolean };

/**
 * Trả về QR để hiển thị:
 * - Ưu tiên ảnh QR tĩnh (BANK_QR_IMAGE) nếu được cấu hình.
 * - Nếu không, dựng VietQR động qua vietqr.io (đã nhúng số tiền + nội dung).
 * - null nếu chưa đủ thông tin dựng QR (trang vẫn hiển thị số TK để CK thủ công).
 */
export function resolveQr(args: { amountVnd: number; memo: string }): ResolvedQr | null {
  if (env.bank.qrImage) return { url: env.bank.qrImage, isStatic: true };
  if (env.bank.bankId && env.bank.account) {
    const p = new URLSearchParams({
      amount: String(Math.round(args.amountVnd)),
      addInfo: args.memo,
      accountName: env.bank.accountName,
    });
    const url = `https://img.vietqr.io/image/${env.bank.bankId}-${env.bank.account}-${env.bank.qrTemplate}.png?${p.toString()}`;
    return { url, isStatic: false };
  }
  return null;
}

/**
 * Trích mã giao dịch PIC... từ nội dung chuyển khoản (dùng cho đối chiếu/tự động).
 * Chuẩn hóa (in hoa, bỏ ký tự không phải chữ-số) rồi bắt token bắt đầu bằng PIC.
 */
export function extractTxnRef(content: string): string | null {
  const norm = (content || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = /PIC[0-9A-Z]+/.exec(norm);
  return m ? m[0] : null;
}

/** (Tuỳ chọn) Xác thực webhook tự xác nhận qua header `Authorization: Apikey <key>`. */
export function verifyWebhookAuth(authHeader: string | null): boolean {
  const expected = env.bank.sepayApiKey;
  if (!expected) return true; // chưa đặt key -> chấp nhận (chỉ nên dùng khi dev)
  if (!authHeader) return false;
  const token = authHeader.replace(/^Apikey\s+/i, "").trim();
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
