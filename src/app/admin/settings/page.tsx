import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { updatePlatformSettingsAction } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader, Alert } from "@/components/ui";
import { LICENSE_ORDER, LICENSE_LABELS, TIER_LABELS } from "@/lib/constants";
import type { SellerTier } from "@prisma/client";

export const dynamic = "force-dynamic";

const TIERS: SellerTier[] = ["NEW", "PRO", "ELITE"];

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireRole("ADMIN");
  const sp = await searchParams;
  const s = await getSettings();

  return (
    <div>
      <PageHeader title="Cấu hình nền tảng" subtitle="Hoa hồng, gói subscription và giá license mặc định (AD2–AD4)." />
      {sp.saved && <div className="mb-4"><Alert kind="success">Đã lưu cấu hình.</Alert></div>}

      <form action={updatePlatformSettingsAction} className="space-y-6">
        {/* AD4 — Hoa hồng */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900">Hoa hồng theo tier người bán (%)</h2>
          <p className="mb-3 text-sm text-gray-500">Phần trăm nền tảng giữ lại trên mỗi giao dịch.</p>
          <div className="grid grid-cols-3 gap-3">
            {TIERS.map((t) => (
              <div key={t}>
                <label className="label">{TIER_LABELS[t]}</label>
                <div className="flex items-center gap-1">
                  <input name={`comm_${t}`} type="number" min={0} max={90} defaultValue={Math.round(s.commission[t] * 100)} className="input text-right" />
                  <span className="text-gray-500">%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AD3 — Gói subscription */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900">Gói subscription</h2>
          <p className="mb-3 text-sm text-gray-500">Giá theo tháng (VND) và quota số ảnh/tháng (−1 = không giới hạn).</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="mb-2 font-medium text-gray-800">Pro</p>
              <label className="label">Giá / tháng</label>
              <input name="plan_PRO_price" type="number" min={0} step={1000} defaultValue={s.plans.PRO.priceVnd} className="input" />
              <label className="label mt-2">Quota (ảnh/tháng)</label>
              <input name="plan_PRO_quota" type="number" min={0} defaultValue={s.plans.PRO.quota} className="input" />
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="mb-2 font-medium text-gray-800">Unlimited</p>
              <label className="label">Giá / tháng</label>
              <input name="plan_UNLIMITED_price" type="number" min={0} step={1000} defaultValue={s.plans.UNLIMITED.priceVnd} className="input" />
              <label className="label mt-2">Quota (−1 = vô hạn)</label>
              <input name="plan_UNLIMITED_quota" type="number" defaultValue={s.plans.UNLIMITED.quota} className="input" />
            </div>
          </div>
        </div>

        {/* AD2 — Giá license mặc định */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900">Giá license mặc định (gợi ý khi đăng ảnh)</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {LICENSE_ORDER.map((lt) => (
              <div key={lt}>
                <label className="label">{LICENSE_LABELS[lt]}</label>
                <input name={`lic_${lt}`} type="number" min={0} step={1000} defaultValue={s.licenseDefaults[lt]} className="input" />
              </div>
            ))}
          </div>
        </div>

        <SubmitButton className="btn-primary">Lưu cấu hình</SubmitButton>
      </form>
    </div>
  );
}
