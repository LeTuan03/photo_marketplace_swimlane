import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { formatVnd } from "@/lib/money";
import { env } from "@/lib/env";
import { requestPayoutAction } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader, StatCard, Alert, PayoutStatusBadge, EscrowStatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function EarningsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; payout?: string }>;
}) {
  const user = await requireRole("SELLER", "ADMIN");
  const sp = await searchParams;

  const [held, releasedAgg, holds, payouts, txns] = await Promise.all([
    prisma.escrowHold.aggregate({ where: { sellerId: user.id, status: "HELD" }, _sum: { amountVnd: true } }),
    prisma.escrowHold.aggregate({ where: { sellerId: user.id, status: "RELEASED" }, _sum: { amountVnd: true } }),
    prisma.escrowHold.findMany({
      where: { sellerId: user.id, status: "HELD" },
      orderBy: { holdUntil: "asc" },
      take: 10,
      include: { orderItem: { include: { photo: { select: { title: true } } } } },
    }),
    prisma.payout.findMany({ where: { sellerId: user.id }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.walletTransaction.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 15 }),
  ]);

  const escrowHeld = held._sum.amountVnd ?? 0;
  const totalReleased = releasedAgg._sum.amountVnd ?? 0;

  return (
    <div>
      <PageHeader title="Thu nhập" subtitle="Số dư, escrow đang giữ và rút tiền." />

      {sp.error && <div className="mb-4"><Alert kind="error">{decodeURIComponent(sp.error)}</Alert></div>}
      {sp.payout && <div className="mb-4"><Alert kind="success">Đã gửi yêu cầu rút tiền. Xử lý trong 2–5 ngày làm việc.</Alert></div>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Số dư rút được" value={formatVnd(user.balanceVnd)} />
        <StatCard label="Đang giữ (escrow)" value={formatVnd(escrowHeld)} hint={`Giải ngân sau ${env.rules.escrowHoldDays} ngày`} />
        <StatCard label="Đã giải ngân (tổng)" value={formatVnd(totalReleased)} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Rút tiền */}
        <div className="card p-5">
          <h2 className="mb-3 font-semibold text-gray-900">Yêu cầu rút tiền</h2>
          {user.kycStatus !== "VERIFIED" && (
            <div className="mb-3">
              <Alert kind="info">Tài khoản chưa xác minh KYC ({user.kycStatus}). Liên hệ admin để xác minh trước khi rút tiền.</Alert>
            </div>
          )}
          <form action={requestPayoutAction} className="space-y-3">
            <div>
              <label className="label">Số tiền (VND)</label>
              <input name="amountVnd" type="number" min={env.rules.minPayoutVnd} step={1000} defaultValue={Math.min(user.balanceVnd, user.balanceVnd)} className="input" />
              <p className="mt-1 text-xs text-gray-400">Tối thiểu {formatVnd(env.rules.minPayoutVnd)}.</p>
            </div>
            <div>
              <label className="label">Phương thức</label>
              <select name="method" className="input" defaultValue={user.payoutMethod ?? "BANK"}>
                <option value="BANK">Chuyển khoản ngân hàng</option>
                <option value="PAYPAL">PayPal</option>
              </select>
            </div>
            <div>
              <label className="label">Thông tin nhận tiền</label>
              <input name="destination" defaultValue={user.payoutAccount ?? ""} className="input" placeholder="Số TK / email PayPal" />
            </div>
            <SubmitButton className="btn-primary w-full">Gửi yêu cầu rút</SubmitButton>
          </form>
        </div>

        {/* Escrow đang giữ */}
        <div className="card p-5">
          <h2 className="mb-3 font-semibold text-gray-900">Khoản đang giữ trong escrow</h2>
          {holds.length === 0 ? (
            <p className="text-sm text-gray-500">Không có khoản nào đang giữ.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {holds.map((h) => (
                <div key={h.id} className="flex items-center justify-between border-b border-gray-100 pb-2">
                  <div>
                    <p className="text-gray-800">{h.orderItem.photo.title}</p>
                    <p className="text-xs text-gray-400">Giải ngân: {new Date(h.holdUntil).toLocaleDateString("vi-VN")}</p>
                  </div>
                  <span className="font-medium text-emerald-700">{formatVnd(h.amountVnd)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lịch sử */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-3 font-semibold text-gray-900">Lịch sử rút tiền</h2>
          {payouts.length === 0 ? (
            <p className="text-sm text-gray-500">Chưa có yêu cầu rút tiền.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {payouts.map((p) => (
                <div key={p.id} className="flex items-center justify-between border-b border-gray-100 pb-2">
                  <div>
                    <p className="text-gray-800">{formatVnd(p.amountVnd)} · {p.method}</p>
                    <p className="text-xs text-gray-400">{new Date(p.createdAt).toLocaleString("vi-VN")}</p>
                  </div>
                  <PayoutStatusBadge status={p.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <h2 className="mb-3 font-semibold text-gray-900">Biến động số dư</h2>
          {txns.length === 0 ? (
            <p className="text-sm text-gray-500">Chưa có biến động.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {txns.map((t) => (
                <div key={t.id} className="flex items-center justify-between border-b border-gray-100 pb-2">
                  <div>
                    <p className="text-gray-800">{t.note ?? t.type}</p>
                    <p className="text-xs text-gray-400">{new Date(t.createdAt).toLocaleString("vi-VN")}</p>
                  </div>
                  <span className={t.amountVnd >= 0 ? "font-medium text-emerald-700" : "font-medium text-red-600"}>
                    {t.amountVnd >= 0 ? "+" : ""}{formatVnd(t.amountVnd)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
