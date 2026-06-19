import "server-only";
import crypto from "node:crypto";
import { env } from "./env";

/**
 * Tích hợp VNPay (sandbox) theo chuẩn vnp_Version 2.1.0.
 * Cơ chế ký: sort param theo key, encode value (encodeURIComponent + %20->+),
 * nối key=value bằng &, HMAC-SHA512 với hash secret.
 * Tham chiếu: tài liệu & demo Node.js chính thức của VNPay.
 */

function encodeVal(v: string): string {
  return encodeURIComponent(v).replace(/%20/g, "+");
}

/** Sắp xếp + encode giống sortObject trong demo VNPay. */
function buildSigned(params: Record<string, string>): string {
  const keys = Object.keys(params)
    .filter((k) => params[k] !== "" && params[k] !== undefined && params[k] !== null)
    .sort();
  return keys.map((k) => `${encodeVal(k)}=${encodeVal(params[k])}`).join("&");
}

function hmac512(data: string): string {
  return crypto.createHmac("sha512", env.vnpay.hashSecret).update(Buffer.from(data, "utf-8")).digest("hex");
}

/** Định dạng thời gian theo GMT+7: yyyyMMddHHmmss. */
function vnpDate(d: Date): string {
  const t = new Date(d.getTime() + 7 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}` +
    `${p(t.getUTCHours())}${p(t.getUTCMinutes())}${p(t.getUTCSeconds())}`
  );
}

export type CreatePaymentArgs = {
  amountVnd: number;
  txnRef: string; // mã tham chiếu duy nhất (vnp_TxnRef) = order.id rút gọn
  orderInfo: string;
  ipAddr: string;
  bankCode?: string;
  expireMinutes?: number;
  locale?: "vn" | "en";
};

export function isConfigured(): boolean {
  return Boolean(env.vnpay.tmnCode && env.vnpay.hashSecret);
}

export function createPaymentUrl(args: CreatePaymentArgs): string {
  const now = new Date();
  const params: Record<string, string> = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: env.vnpay.tmnCode,
    vnp_Locale: args.locale ?? "vn",
    vnp_CurrCode: "VND",
    vnp_TxnRef: args.txnRef,
    vnp_OrderInfo: args.orderInfo,
    vnp_OrderType: "other",
    vnp_Amount: String(Math.round(args.amountVnd) * 100), // VNPay yêu cầu *100
    vnp_ReturnUrl: env.vnpay.returnUrl,
    vnp_IpAddr: args.ipAddr || "127.0.0.1",
    vnp_CreateDate: vnpDate(now),
    vnp_ExpireDate: vnpDate(new Date(now.getTime() + (args.expireMinutes ?? 15) * 60 * 1000)),
  };
  if (args.bankCode) params.vnp_BankCode = args.bankCode;

  const signData = buildSigned(params);
  const secureHash = hmac512(signData);
  return `${env.vnpay.payUrl}?${signData}&vnp_SecureHash=${secureHash}`;
}

/** Xác thực chữ ký trên dữ liệu trả về từ VNPay (return URL hoặc IPN). */
export function verifySignature(query: Record<string, string>): boolean {
  const received = query.vnp_SecureHash;
  if (!received) return false;
  const clone: Record<string, string> = { ...query };
  delete clone.vnp_SecureHash;
  delete clone.vnp_SecureHashType;
  const signData = buildSigned(clone);
  const expected = hmac512(signData);
  // so sánh an toàn theo thời gian
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(received, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function isPaymentSuccess(query: Record<string, string>): boolean {
  return query.vnp_ResponseCode === "00" && query.vnp_TransactionStatus === "00";
}
