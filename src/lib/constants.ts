import type { LicenseType, SellerTier } from "@prisma/client";

// --- License (AD2) ---
export const LICENSE_LABELS: Record<LicenseType, string> = {
  PERSONAL: "Cá nhân",
  COMMERCIAL: "Thương mại",
  EXTENDED: "Mở rộng",
  EDITORIAL: "Biên tập (Editorial)",
};

export const LICENSE_DESCRIPTIONS: Record<LicenseType, string> = {
  PERSONAL: "Dùng cho mục đích cá nhân, phi lợi nhuận.",
  COMMERCIAL: "Dùng cho dự án thương mại, marketing, sản phẩm.",
  EXTENDED: "Thương mại không giới hạn lượt in/bán lại sản phẩm phái sinh.",
  EDITORIAL: "Chỉ dùng cho mục đích báo chí, tin tức, giáo dục.",
};

export const LICENSE_ORDER: LicenseType[] = [
  "PERSONAL",
  "COMMERCIAL",
  "EXTENDED",
  "EDITORIAL",
];

// Gợi ý giá mặc định theo license (VND) khi seller đăng ảnh
export const DEFAULT_LICENSE_PRICE: Record<LicenseType, number> = {
  PERSONAL: 50_000,
  COMMERCIAL: 150_000,
  EXTENDED: 500_000,
  EDITORIAL: 120_000,
};

// --- Commission theo tier người bán (AD4) ---
// % platform giữ lại. Người bán mới chịu phí cao hơn.
export const COMMISSION_RATE: Record<SellerTier, number> = {
  NEW: 0.3,
  PRO: 0.2,
  ELITE: 0.1,
};

export const TIER_LABELS: Record<SellerTier, string> = {
  NEW: "Mới",
  PRO: "Pro",
  ELITE: "Elite",
};

// --- Kích thước tải (size) ---
export const SIZE_LABELS: Record<string, string> = {
  S: "Nhỏ (web)",
  M: "Vừa",
  L: "Lớn",
  ORIGINAL: "Gốc (full)",
};

// --- Danh mục mặc định (AD1) ---
export const DEFAULT_CATEGORIES = [
  { slug: "phong-canh", name: "Phong cảnh" },
  { slug: "chan-dung", name: "Chân dung" },
  { slug: "thuong-mai", name: "Thương mại" },
  { slug: "do-hoa", name: "Đồ họa" },
  { slug: "vector", name: "Vector" },
  { slug: "thien-nhien", name: "Thiên nhiên" },
  { slug: "kien-truc", name: "Kiến trúc" },
  { slug: "am-thuc", name: "Ẩm thực" },
];

export function commissionRate(tier: SellerTier): number {
  return COMMISSION_RATE[tier] ?? 0.3;
}
