import type { LicenseType, SellerTier, PlanType } from "@prisma/client";

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

/**
 * Phạm vi sử dụng CỤ THỂ cho từng license — biến "dùng đúng/sai mục đích" thành thứ
 * kiểm chứng được. Hiển thị: lúc chọn license (B4), ở bước đồng ý điều khoản khi thanh
 * toán, và trên trang tra cứu công khai `/verify` (cùng certificate). Đây là cơ sở để
 * đối chiếu khi nghi một ảnh bị dùng vượt phạm vi ra bên ngoài.
 */
export const LICENSE_SCOPE: Record<LicenseType, { allowed: string[]; forbidden: string[] }> = {
  PERSONAL: {
    allowed: [
      "Mục đích cá nhân, phi lợi nhuận",
      "Trang/mạng xã hội cá nhân (không phải quảng cáo)",
      "In ấn cá nhân số lượng nhỏ (trang trí, quà tặng)",
      "Bài tập, đồ án học tập",
    ],
    forbidden: [
      "Quảng cáo, marketing, nội dung được tài trợ",
      "Sản phẩm/dịch vụ bán ra, bao bì, ấn phẩm thương mại",
      "Logo, nhận diện thương hiệu",
      "Bán lại hoặc phân phối lại file ảnh",
    ],
  },
  COMMERCIAL: {
    allowed: [
      "Quảng cáo, marketing, mạng xã hội của doanh nghiệp",
      "Website, landing page, ấn phẩm thương mại",
      "Bao bì sản phẩm (tối đa ~500.000 bản)",
      "Thuyết trình, nội dung trả phí, video",
    ],
    forbidden: [
      "Bán lại / phân phối lại chính file ảnh dưới dạng stock",
      "Sản phẩm phái sinh để bán KHÔNG giới hạn số lượng (cần license Mở rộng)",
      "Đăng ký nhãn hiệu/logo độc quyền từ ảnh",
    ],
  },
  EXTENDED: {
    allowed: [
      "Toàn bộ quyền của license Thương mại",
      "Sản phẩm phái sinh để BÁN không giới hạn số lượng (áo, cốc, template, theme...)",
      "In ấn không giới hạn số bản",
    ],
    forbidden: [
      "Bán lại / phân phối lại chính file ảnh gốc dưới dạng stock",
    ],
  },
  EDITORIAL: {
    allowed: [
      "Báo chí, tin tức, bài viết mang tính thông tin",
      "Mục đích giáo dục, học thuật",
      "Bình luận, phê bình, nội dung biên tập",
    ],
    forbidden: [
      "MỌI mục đích thương mại / quảng cáo / bán hàng",
      "Sản phẩm bán ra, bao bì, marketing",
      "Ngụ ý sự chứng thực/tài trợ của người hoặc thương hiệu xuất hiện trong ảnh",
    ],
  },
};

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

/** Chuẩn hoá size do client gửi: chỉ chấp nhận S/M/L/ORIGINAL, còn lại -> ORIGINAL. */
export function validSizeLabel(label: string): string {
  return label in SIZE_LABELS ? label : "ORIGINAL";
}

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

// --- Subscription (AD3 / B7) ---
export const PLAN_LABELS: Record<PlanType, string> = {
  FREE: "Free",
  PRO: "Pro",
  UNLIMITED: "Unlimited",
};

// Giá theo tháng (VND). FREE = 0.
export const PLAN_PRICE: Record<PlanType, number> = {
  FREE: 0,
  PRO: 199_000,
  UNLIMITED: 499_000,
};

// Số ảnh tải/tháng. -1 = không giới hạn.
export const PLAN_QUOTA: Record<PlanType, number> = {
  FREE: 0,
  PRO: 10,
  UNLIMITED: -1,
};

export const PLAN_DESCRIPTIONS: Record<PlanType, string> = {
  FREE: "Xem preview có watermark. Mua lẻ từng ảnh theo license.",
  PRO: "Tải 10 ảnh/tháng không cần mua lẻ. Phù hợp cá nhân & freelancer.",
  UNLIMITED: "Tải không giới hạn mỗi tháng. Dành cho team & agency.",
};

export const PLAN_PERIOD_DAYS = 30;

export function planQuota(plan: PlanType): number {
  return PLAN_QUOTA[plan] ?? 0;
}
