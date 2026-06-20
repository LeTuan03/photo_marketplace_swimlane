import "server-only";
import crypto from "node:crypto";
import { env } from "./env";

/**
 * Tích hợp PayOS (VietQR) — một cổng duy nhất thay cho VNPay + MoMo.
 * - Tạo link thanh toán: POST /v2/payment-requests, ký HMAC-SHA256 trên 5 trường cố định.
 * - Webhook (nguồn xác nhận tin cậy): ký HMAC-SHA256 trên object `data` đã sort key.
 * Thuật toán ký mô phỏng đúng SDK @payos/node để khỏi thêm dependency.
 * Tham chiếu: tài liệu PayOS (payos.vn/docs).
 */

function hmac256(data: string): string {
  return crypto.createHmac("sha256", env.payos.checksumKey).update(Buffer.from(data, "utf-8")).digest("hex");
}

export function isConfigured(): boolean {
  return Boolean(env.payos.clientId && env.payos.apiKey && env.payos.checksumKey);
}

/** Chữ ký khi tạo payment-request: 5 trường theo thứ tự alphabet. */
function signCreate(p: {
  amount: number;
  cancelUrl: string;
  description: string;
  orderCode: number;
  returnUrl: string;
}): string {
  const raw =
    `amount=${p.amount}&cancelUrl=${p.cancelUrl}&description=${p.description}` +
    `&orderCode=${p.orderCode}&returnUrl=${p.returnUrl}`;
  return hmac256(raw);
}

/** Chuyển object `data` thành query string đã sort key (giống convertObjToQueryStr của PayOS). */
function dataToQueryStr(data: Record<string, unknown>): string {
  return Object.keys(data)
    .sort()
    .map((key) => {
      let value = data[key];
      if (value != null && Array.isArray(value)) {
        value = JSON.stringify(value);
      }
      if (value === null || value === undefined || value === "undefined" || value === "null") {
        value = "";
      }
      return `${key}=${value}`;
    })
    .join("&");
}

export type PayosCreateArgs = {
  orderCode: number;
  amountVnd: number;
  description: string; // PayOS giới hạn <= 25 ký tự
  returnUrl: string;
  cancelUrl: string;
};

/** Gọi PayOS tạo link thanh toán, trả về checkoutUrl để chuyển hướng người dùng. */
export async function createPaymentLink(args: PayosCreateArgs): Promise<string> {
  const amount = Math.round(args.amountVnd);
  const description = args.description.slice(0, 25);
  const signature = signCreate({
    amount,
    cancelUrl: args.cancelUrl,
    description,
    orderCode: args.orderCode,
    returnUrl: args.returnUrl,
  });

  const res = await fetch(env.payos.createUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-client-id": env.payos.clientId,
      "x-api-key": env.payos.apiKey,
    },
    body: JSON.stringify({
      orderCode: args.orderCode,
      amount,
      description,
      returnUrl: args.returnUrl,
      cancelUrl: args.cancelUrl,
      signature,
    }),
  });

  const json = (await res.json()) as {
    code?: string;
    desc?: string;
    data?: { checkoutUrl?: string } | null;
  };

  if (json.code !== "00" || !json.data?.checkoutUrl) {
    throw new Error(`PayOS tạo link thất bại: ${json.desc ?? "unknown"} (code ${json.code})`);
  }
  return json.data.checkoutUrl;
}

export type PayosWebhook = {
  code?: string;
  desc?: string;
  success?: boolean;
  data?: Record<string, unknown> & {
    orderCode?: number;
    amount?: number;
    reference?: string;
    paymentLinkId?: string;
    code?: string;
  };
  signature?: string;
};

/** Xác thực chữ ký webhook PayOS (so sánh an toàn theo thời gian). */
export function verifyWebhookData(body: PayosWebhook): boolean {
  if (!body?.data || !body.signature) return false;
  const expected = hmac256(dataToQueryStr(body.data));
  const a = Buffer.from(expected);
  const b = Buffer.from(body.signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Giao dịch thành công khi webhook báo code "00". */
export function isPaymentSuccess(body: PayosWebhook): boolean {
  return body.code === "00" && body.data?.code === "00";
}
