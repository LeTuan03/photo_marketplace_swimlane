import { Check } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { formatVnd } from "@/lib/money";
import { PLAN_LABELS, PLAN_PRICE, PLAN_QUOTA, PLAN_DESCRIPTIONS } from "@/lib/constants";
import { ensureFreshQuota, getQuotaState } from "@/lib/subscription";
import { subscribeAction, cancelSubscriptionAction } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader, StatCard, Alert } from "@/components/ui";
import type { PlanType } from "@prisma/client";

export const dynamic = "force-dynamic";

const PLANS: PlanType[] = ["FREE", "PRO", "UNLIMITED"];

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ activated?: string; downgraded?: string; cancelled?: string; error?: string }>;
}) {
  const sp = await searchParams;
  let user = await requireUser();
  user = await ensureFreshQuota(user);
  const state = getQuotaState(user);

  return (
    <div>
      <PageHeader title="Gói đăng ký" subtitle="Tải ảnh theo quota hằng tháng thay vì mua lẻ." />

      {sp.activated && <div className="mb-4"><Alert kind="success">Kích hoạt gói thành công!</Alert></div>}
      {sp.downgraded && <div className="mb-4"><Alert kind="info">Đã chuyển về gói Free.</Alert></div>}
      {sp.cancelled && <div className="mb-4"><Alert kind="info">Đã tắt tự gia hạn. Gói vẫn dùng được tới hết kỳ.</Alert></div>}
      {sp.error && <div className="mb-4"><Alert kind="error">{decodeURIComponent(sp.error)}</Alert></div>}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Gói hiện tại" value={PLAN_LABELS[state.plan]} hint={state.isActive ? "Đang hoạt động" : "Free"} />
        <StatCard
          label="Quota đã dùng"
          value={state.limit < 0 ? `${state.used} (∞)` : `${state.used}/${state.limit}`}
          hint={state.limit < 0 ? "Không giới hạn" : `Còn ${state.remaining} lượt`}
        />
        <StatCard
          label="Gia hạn / reset"
          value={user.planRenewsAt ? new Date(user.planRenewsAt).toLocaleDateString("vi-VN") : "—"}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((plan) => {
          const current = state.plan === plan && (plan === "FREE" || state.isActive);
          const quota = PLAN_QUOTA[plan];
          return (
            <div key={plan} className={`card flex flex-col p-5 ${current ? "ring-2 ring-brand-500" : ""}`}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">{PLAN_LABELS[plan]}</h3>
                {current && <span className="badge bg-brand-100 text-brand-700">Đang dùng</span>}
              </div>
              <p className="mt-1 text-2xl font-bold text-brand-700">
                {plan === "FREE" ? "Miễn phí" : formatVnd(PLAN_PRICE[plan])}
                {plan !== "FREE" && <span className="text-sm font-normal text-gray-400">/tháng</span>}
              </p>
              <p className="mt-2 text-sm text-gray-600">{PLAN_DESCRIPTIONS[plan]}</p>
              <ul className="mt-3 flex-1 space-y-1 text-sm text-gray-600">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500" />
                  {quota < 0 ? "Tải không giới hạn" : quota === 0 ? "Chỉ xem preview" : `${quota} ảnh/tháng`}
                </li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" /> Certificate license</li>
                {plan !== "FREE" && <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" /> Không cần mua lẻ</li>}
              </ul>

              <div className="mt-4">
                {current ? (
                  plan === "FREE" ? (
                    <button disabled className="btn-outline w-full">Gói hiện tại</button>
                  ) : (
                    <form action={cancelSubscriptionAction}>
                      <SubmitButton className="btn-outline w-full">Tắt tự gia hạn</SubmitButton>
                    </form>
                  )
                ) : (
                  <form action={subscribeAction}>
                    <input type="hidden" name="plan" value={plan} />
                    <SubmitButton className={plan === "FREE" ? "btn-outline w-full" : "btn-primary w-full"}>
                      {plan === "FREE" ? "Chuyển về Free" : "Đăng ký"}
                    </SubmitButton>
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
