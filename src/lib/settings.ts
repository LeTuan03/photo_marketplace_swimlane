import "server-only";
import { prisma } from "./prisma";
import { COMMISSION_RATE, PLAN_PRICE, PLAN_QUOTA, DEFAULT_LICENSE_PRICE, LICENSE_ORDER } from "./constants";
import type { SellerTier, PlanType, LicenseType } from "@prisma/client";

/**
 * Cấu hình nền tảng động (AD1–AD4), lưu trong bảng PlatformSetting (key-value).
 * Giá trị thiếu sẽ fallback về hằng số mặc định trong constants.ts.
 */
export type PlatformSettings = {
  commission: Record<SellerTier, number>; // phần trăm dạng phân số 0..1
  plans: {
    PRO: { priceVnd: number; quota: number };
    UNLIMITED: { priceVnd: number; quota: number };
  };
  licenseDefaults: Record<LicenseType, number>;
};

const TIERS: SellerTier[] = ["NEW", "PRO", "ELITE"];

let cache: { data: PlatformSettings; at: number } | null = null;
const TTL_MS = 10_000;

function num(map: Map<string, string>, key: string, fallback: number): number {
  const v = map.get(key);
  // Coi chuỗi rỗng/khoảng trắng như THIẾU giá trị: Number("") === 0 (hữu hạn) nên
  // nếu không chặn, một row value="" sẽ biến hoa hồng -> 0% và giá license/gói -> 0đ.
  if (v === undefined || v.trim() === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function getSettings(): Promise<PlatformSettings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const rows = await prisma.platformSetting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const commission = {} as Record<SellerTier, number>;
  for (const t of TIERS) {
    // lưu dạng phần trăm (vd "30"); chuyển về phân số
    commission[t] = num(map, `commission.${t}`, COMMISSION_RATE[t] * 100) / 100;
  }

  const licenseDefaults = {} as Record<LicenseType, number>;
  for (const lt of LICENSE_ORDER) {
    licenseDefaults[lt] = num(map, `license.${lt}.price`, DEFAULT_LICENSE_PRICE[lt]);
  }

  const data: PlatformSettings = {
    commission,
    plans: {
      PRO: {
        priceVnd: num(map, "plan.PRO.price", PLAN_PRICE.PRO),
        quota: num(map, "plan.PRO.quota", PLAN_QUOTA.PRO),
      },
      UNLIMITED: {
        priceVnd: num(map, "plan.UNLIMITED.price", PLAN_PRICE.UNLIMITED),
        quota: num(map, "plan.UNLIMITED.quota", PLAN_QUOTA.UNLIMITED),
      },
    },
    licenseDefaults,
  };

  cache = { data, at: Date.now() };
  return data;
}

export function invalidateSettings() {
  cache = null;
}

/** Ghi nhiều cặp key-value và xóa cache. */
export async function saveSettings(entries: Record<string, string>): Promise<void> {
  await prisma.$transaction(
    Object.entries(entries).map(([key, value]) =>
      prisma.platformSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      }),
    ),
  );
  invalidateSettings();
}

// --- Helper suy ra giá trị từ settings ---
export function commissionFor(tier: SellerTier, s: PlatformSettings): number {
  return s.commission[tier] ?? COMMISSION_RATE[tier];
}

export function planPriceFor(plan: PlanType, s: PlatformSettings): number {
  if (plan === "PRO") return s.plans.PRO.priceVnd;
  if (plan === "UNLIMITED") return s.plans.UNLIMITED.priceVnd;
  return 0;
}

export function planQuotaFor(plan: PlanType, s: PlatformSettings): number {
  if (plan === "PRO") return s.plans.PRO.quota;
  if (plan === "UNLIMITED") return s.plans.UNLIMITED.quota;
  return 0; // FREE
}
