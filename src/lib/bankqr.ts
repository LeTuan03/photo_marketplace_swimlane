import "server-only";
import crypto from "node:crypto";
import { env } from "./env";

/**
 * Thanh toán CHUYỂN KHOẢN bằng mã QR tài khoản ngân hàng.
 * Xác nhận TỰ ĐỘNG REALTIME: nguồn giám sát biến động số dư (SePay/Casso) đẩy webhook về
 * /api/payment/sepay khi tiền vào; hệ thống tự khớp đơn qua mã PIC (extractTxnRef) + đúng số
 * tiền rồi fulfill ngay (xem src/lib/bank-ingest.ts). Phần không tự khớp -> admin đối chiếu ở
 * /admin/bank-transactions; xác nhận THỦ CÔNG ở /admin/payments giữ làm dự phòng.
 * QR có 2 cách: (1) ảnh QR tĩnh của tài khoản (BANK_QR_IMAGE) — đúng nghĩa "ảnh QR TK";
 * (2) VietQR động (vietqr.io) tự điền sẵn số tiền + nội dung khi chưa có ảnh tĩnh.
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

/**
 * Xác thực webhook biến động số dư (tự cộng tiền realtime). Chấp nhận key qua:
 *  - `Authorization: Apikey <key>`  (SePay)
 *  - `secure-token: <key>`          (Casso)
 * FAIL-CLOSED: nếu CHƯA cấu hình key thì TỪ CHỐI mọi request — webhook không có key là
 * webhook không xác thực, cho phép kẻ tấn công gửi "đã nhận tiền" giả (khớp memo + số tiền
 * vốn hiển thị cho chính người mua) để fulfill miễn phí.
 */
export function verifyWebhookAuth(args: { authHeader: string | null; secureToken: string | null }): boolean {
  const expected = env.bank.webhookKey;
  if (!expected) return false; // chưa đặt key -> từ chối (bật webhook phải có key)
  const token = (args.secureToken?.trim() || args.authHeader?.replace(/^Apikey\s+/i, "").trim() || "");
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
