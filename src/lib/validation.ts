import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2, "Tên tối thiểu 2 ký tự").max(80),
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự").max(100),
  role: z.enum(["BUYER", "SELLER"]).default("BUYER"),
});

export const loginSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

export const licenseInputSchema = z.object({
  type: z.enum(["PERSONAL", "COMMERCIAL", "EXTENDED", "EDITORIAL"]),
  priceVnd: z.coerce.number().int().min(0).max(1_000_000_000),
  enabled: z.coerce.boolean().default(false),
});

export const photoMetaSchema = z.object({
  title: z.string().min(3, "Tiêu đề tối thiểu 3 ký tự").max(120),
  description: z.string().max(2000).default(""),
  categorySlug: z.string().optional(),
  tags: z.string().max(300).default(""), // CSV
  hasModelRelease: z.coerce.boolean().default(false),
  allowSwap: z.coerce.boolean().default(false),
});

export const payoutSchema = z.object({
  amountVnd: z.coerce.number().int().min(1),
  method: z.enum(["BANK", "PAYPAL"]),
  destination: z.string().min(3, "Vui lòng nhập thông tin nhận tiền").max(200),
});

/**
 * Chuẩn hoá redirect nội bộ -> chống open-redirect. Chỉ chấp nhận path bắt đầu
 * bằng "/" và KHÔNG phải "//" hay "/\" (trình duyệt coi là URL ngoài, protocol-relative).
 */
export function safeInternalPath(next: unknown, fallback = "/"): string {
  const s = typeof next === "string" ? next : "";
  if (!s.startsWith("/")) return fallback;
  if (s.startsWith("//") || s.startsWith("/\\")) return fallback;
  return s;
}

export function parseTags(csv: string): string[] {
  return Array.from(
    new Set(
      csv
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0 && t.length <= 40),
    ),
  ).slice(0, 20);
}
