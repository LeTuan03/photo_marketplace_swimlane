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

/** Mã tham chiếu giao dịch ngắn cho VNPay (vnp_TxnRef, <=34 ký tự). */
export function makeTxnRef(): string {
  const ts = Math.floor(Date.now() / 1000).toString(36).toUpperCase();
  const rnd = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `PIC${ts}${rnd}`;
}
