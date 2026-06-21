import crypto from "node:crypto";
import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** Mã chứng nhận license, ví dụ: PIC-7F3A-9C21. */
export function makeCertNo(): string {
  const hex = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `PIC-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

/** Chuẩn hoá mã certificate người dùng nhập (bỏ khoảng trắng, viết hoa). */
export function normalizeCertNo(input: string): string {
  return input.trim().toUpperCase();
}

/** Che một phần tên người giữ license cho trang tra cứu công khai: "Nguyễn Văn A" -> "N••• V••• A•••". */
export function maskName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => `${[...p][0] ?? ""}•••`)
    .join(" ");
}

/** Che một phần email: "nguyenvana@gmail.com" -> "ng•••@gmail.com". */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "•••";
  const user = email.slice(0, at);
  const domain = email.slice(at);
  return `${user.slice(0, 2)}•••${domain}`;
}

/** Mã tham chiếu giao dịch ngắn cho VNPay (vnp_TxnRef, <=34 ký tự). */
export function makeTxnRef(): string {
  const ts = Math.floor(Date.now() / 1000).toString(36).toUpperCase();
  const rnd = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `PIC${ts}${rnd}`;
}

/**
 * Mã đơn dạng SỐ cho PayOS (orderCode). PayOS yêu cầu số nguyên dương, duy nhất,
 * <= Number.MAX_SAFE_INTEGER. Ghép giây-epoch (10 chữ số) với 3 chữ số ngẫu nhiên
 * cho ~13 chữ số, an toàn dưới 2^53. Trùng lặp cực hiếm và bị ràng buộc unique của
 * providerTxnRef bắt được (người dùng thử lại).
 */
export function makeOrderCode(): number {
  const sec = Math.floor(Date.now() / 1000);
  return sec * 1000 + crypto.randomInt(0, 1000);
}
