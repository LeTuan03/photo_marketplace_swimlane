import "server-only";
import crypto from "node:crypto";
import { env } from "./env";
import { makeTxnRef } from "./utils";

/**
 * Tích hợp MoMo (sandbox) — API v2 gateway create (captureWallet).
 * Chữ ký: HMAC-SHA256 trên chuỗi raw theo thứ tự khóa cố định của MoMo.
 */

function hmac256(data: string): string {
  return crypto.createHmac("sha256", env.momo.secretKey).update(Buffer.from(data, "utf-8")).digest("hex");
}

export function isConfigured(): boolean {
  return Boolean(env.momo.partnerCode && env.momo.accessKey && env.momo.secretKey);
}

function redirectUrl() {
  return `${env.appUrl}/api/payment/momo/callback`;
}
function ipnUrl() {
  return `${env.appUrl}/api/payment/momo/ipn`;
}

export type MomoCreateArgs = {
  amountVnd: number;
  orderId: string; // = providerTxnRef
  orderInfo: string;
};

/** Gọi MoMo tạo giao dịch, trả về payUrl để chuyển hướng người dùng. */
export async function createPaymentUrl(args: MomoCreateArgs): Promise<string> {
  const partnerCode = env.momo.partnerCode;
  const accessKey = env.momo.accessKey;
  const requestId = makeTxnRef();
  const orderId = args.orderId;
  const amount = String(Math.round(args.amountVnd));
  const orderInfo = args.orderInfo;
  const extraData = "";
  const requestType = "captureWallet";
  const redirect = redirectUrl();
  const ipn = ipnUrl();

  const raw =
    `accessKey=${accessKey}&amount=${amount}&extraData=${extraData}&ipnUrl=${ipn}` +
    `&orderId=${orderId}&orderInfo=${orderInfo}&partnerCode=${partnerCode}` +
    `&redirectUrl=${redirect}&requestId=${requestId}&requestType=${requestType}`;
  const signature = hmac256(raw);

  const body = {
    partnerCode,
    accessKey,
    requestId,
    amount,
    orderId,
    orderInfo,
    redirectUrl: redirect,
    ipnUrl: ipn,
    extraData,
    requestType,
    signature,
    lang: "vi",
  };

  const res = await fetch(env.momo.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { resultCode?: number; payUrl?: string; message?: string };

  if (data.resultCode !== 0 || !data.payUrl) {
    throw new Error(`MoMo tạo giao dịch thất bại: ${data.message ?? "unknown"} (code ${data.resultCode})`);
  }
  return data.payUrl;
}

/** Xác thực chữ ký dữ liệu MoMo trả về (return URL hoặc IPN). */
export function verifySignature(p: Record<string, string>): boolean {
  const received = p.signature;
  if (!received) return false;
  const raw =
    `accessKey=${env.momo.accessKey}&amount=${p.amount}&extraData=${p.extraData ?? ""}` +
    `&message=${p.message}&orderId=${p.orderId}&orderInfo=${p.orderInfo}&orderType=${p.orderType}` +
    `&partnerCode=${p.partnerCode}&payType=${p.payType}&requestId=${p.requestId}` +
    `&responseTime=${p.responseTime}&resultCode=${p.resultCode}&transId=${p.transId}`;
  const expected = hmac256(raw);
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function isPaymentSuccess(p: Record<string, string>): boolean {
  return String(p.resultCode) === "0";
}
