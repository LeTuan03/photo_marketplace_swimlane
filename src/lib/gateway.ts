import "server-only";
import { env } from "./env";
import { isConfigured as vnpayConfigured } from "./vnpay";
import { isConfigured as momoConfigured } from "./momo";
import { isConfigured as payosConfigured } from "./payos";
import { isConfigured as bankConfigured } from "./bankqr";

/** Có ít nhất một cổng thanh toán THẬT được cấu hình hay không. */
export function anyRealGatewayConfigured(): boolean {
  return bankConfigured() || payosConfigured() || vnpayConfigured() || momoConfigured();
}

/**
 * Cổng GIẢ LẬP (mock) chỉ được phép khi:
 *  - KHÔNG phải production, VÀ
 *  - KHÔNG có cổng thật nào được cấu hình.
 * Nếu đã có cổng thật (kể cả BANKQR), mock bị vô hiệu để tránh bypass thanh toán:
 * trước đây mọi đơn PENDING đều có thể được "thanh toán thành công" miễn phí qua
 * /payment/mock dù đơn dùng cổng khác.
 */
export function mockGatewayEnabled(): boolean {
  return !env.isProd && !anyRealGatewayConfigured();
}
