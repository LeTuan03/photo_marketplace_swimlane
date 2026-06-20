// Truy cập biến môi trường tập trung, có giá trị mặc định an toàn cho dev.

function str(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}
function int(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  appUrl: str("APP_URL", "http://localhost:3000"),
  isProd: process.env.NODE_ENV === "production",

  authSecret: str("AUTH_SECRET", "dev-insecure-auth-secret-change-me"),
  downloadSecret: str("DOWNLOAD_SECRET", "dev-insecure-download-secret-change-me"),
  cronSecret: str("CRON_SECRET", "dev-cron-secret"),

  storageDriver: str("STORAGE_DRIVER", "local") as "local" | "s3",
  localStorageDir: str("LOCAL_STORAGE_DIR", "./storage"),

  s3: {
    endpoint: str("S3_ENDPOINT"),
    region: str("S3_REGION", "us-east-1"),
    bucket: str("S3_BUCKET", "picseo"),
    accessKeyId: str("S3_ACCESS_KEY_ID"),
    secretAccessKey: str("S3_SECRET_ACCESS_KEY"),
    forcePathStyle: str("S3_FORCE_PATH_STYLE", "true") === "true",
  },

  smtp: {
    host: str("SMTP_HOST"),
    port: int("SMTP_PORT", 587),
    user: str("SMTP_USER"),
    pass: str("SMTP_PASS"),
    from: str("SMTP_FROM", "Picseo <no-reply@picseo.local>"),
  },

  vnpay: {
    tmnCode: str("VNPAY_TMN_CODE"),
    hashSecret: str("VNPAY_HASH_SECRET"),
    payUrl: str("VNPAY_PAY_URL", "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html"),
    returnUrl: str("VNPAY_RETURN_URL", "http://localhost:3000/api/payment/vnpay/callback"),
    ipnUrl: str("VNPAY_IPN_URL", "http://localhost:3000/api/payment/vnpay/ipn"),
  },

  momo: {
    partnerCode: str("MOMO_PARTNER_CODE"),
    accessKey: str("MOMO_ACCESS_KEY"),
    secretKey: str("MOMO_SECRET_KEY"),
    endpoint: str("MOMO_ENDPOINT", "https://test-payment.momo.vn/v2/gateway/api/create"),
  },

  payos: {
    clientId: str("PAYOS_CLIENT_ID"),
    apiKey: str("PAYOS_API_KEY"),
    checksumKey: str("PAYOS_CHECKSUM_KEY"),
    createUrl: str("PAYOS_CREATE_URL", "https://api-merchant.payos.vn/v2/payment-requests"),
  },

  // Chuyển khoản VietQR — xác nhận THỦ CÔNG qua biến động số dư (admin đối chiếu).
  bank: {
    bankId: str("BANK_ID"), // mã NH cho VietQR động (vietqr.io), vd: MB, VCB, ACB
    account: str("BANK_ACCOUNT"), // số tài khoản nhận tiền
    accountName: str("BANK_ACCOUNT_NAME"), // tên chủ tài khoản (hiển thị)
    qrImage: str("BANK_QR_IMAGE"), // URL/đường dẫn ảnh QR tĩnh của TK (ưu tiên nếu có)
    qrTemplate: str("BANK_QR_TEMPLATE", "compact2"), // mẫu QR động vietqr.io
    sepayApiKey: str("SEPAY_API_KEY"), // tuỳ chọn: bật webhook tự xác nhận (SePay/Casso)
  },

  google: {
    clientId: str("GOOGLE_CLIENT_ID"),
    clientSecret: str("GOOGLE_CLIENT_SECRET"),
  },

  rules: {
    escrowHoldDays: int("ESCROW_HOLD_DAYS", 7),
    downloadLinkHours: int("DOWNLOAD_LINK_HOURS", 24),
    maxDownloads: int("MAX_DOWNLOADS", 3),
    minPayoutVnd: int("MIN_PAYOUT_VND", 500_000),
  },
};

export type Env = typeof env;
