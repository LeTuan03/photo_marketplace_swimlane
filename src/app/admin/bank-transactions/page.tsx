import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { formatVnd } from "@/lib/money";
import { matchBankTransactionAction, ignoreBankTransactionAction } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader, EmptyState, Alert } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  MATCHED: { text: "Đã khớp", cls: "bg-emerald-50 text-emerald-700" },
  UNMATCHED: { text: "Chưa khớp", cls: "bg-amber-50 text-amber-700" },
  MISMATCH: { text: "Lệch tiền", cls: "bg-red-50 text-red-700" },
  IGNORED: { text: "Bỏ qua", cls: "bg-gray-100 text-gray-500" },
};

/**
 * Sổ biến động số dư + đối chiếu thủ công các giao dịch TREO.
 * Webhook tự khớp đa số; trang này để admin xử lý phần còn lại: tiền vào sai nội dung
 * (UNMATCHED) hoặc lệch số tiền (MISMATCH) -> chọn đúng đơn/gói để khớp, hoặc bỏ qua.
 */
export default async function AdminBankTransactionsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ error?: string }>;
}) {
  await requireRole("ADMIN");
  const sp = await searchParams;

  const [pendingTxns, recentTxns, pendingOrders, pendingSubs] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: { status: { in: ["UNMATCHED", "MISMATCH"] } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.bankTransaction.findMany({
      where: { status: { in: ["MATCHED", "IGNORED"] } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.order.findMany({
      where: { status: "PENDING", paymentProvider: "BANKQR" },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { buyer: { select: { email: true, name: true } } },
    }),
    prisma.subscription.findMany({
      where: { status: "PENDING", paymentProvider: "BANKQR" },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { email: true, name: true } } },
    }),
  ]);

  const targets = [
    ...pendingOrders.map((o) => ({
      value: `order:${o.id}`,
      label: `Đơn ${o.id.slice(-8).toUpperCase()} · ${o.buyer.name || o.buyer.email} · ${formatVnd(o.totalVnd)} · ${o.providerTxnRef ?? ""}`,
    })),
    ...pendingSubs.map((s) => ({
      value: `sub:${s.id}`,
      label: `Gói ${s.plan} · ${s.user.name || s.user.email} · ${formatVnd(s.priceVnd)} · ${s.providerTxnRef ?? ""}`,
    })),
  ];

  return (
    <div>
      <PageHeader
        title="Biến động số dư"
        subtitle="Tiền vào được tự khớp đơn/gói theo nội dung CK (mã PIC) realtime. Phần không tự khớp hiện ở đây để đối chiếu thủ công."
      />

      {sp.error && (
        <div className="mb-4">
          <Alert kind="error">{sp.error}</Alert>
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Cần đối chiếu ({pendingTxns.length})</h2>
        {pendingTxns.length === 0 ? (
          <EmptyState title="Không có giao dịch treo" hint="Mọi khoản tiền vào đều đã được tự khớp hoặc xử lý." />
        ) : (
          <div className="space-y-3">
            {pendingTxns.map((t) => (
              <div key={t.id} className="card space-y-3 p-4 text-sm">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <StatusBadge status={t.status} />
                  <div>
                    <p className="text-xs text-gray-500">Số tiền</p>
                    <p className="font-semibold text-brand-700">{formatVnd(t.amountVnd)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">Nội dung CK</p>
                    <p className="truncate font-mono text-gray-900">{t.content || "(trống)"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Mã trích / Nguồn</p>
                    <p className="font-mono text-gray-900">{t.txnRef ?? "—"} · {t.gateway}</p>
                  </div>
                  <p className="ml-auto text-xs text-gray-400">{new Date(t.createdAt).toLocaleString("vi-VN")}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
                  <form action={matchBankTransactionAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="txnId" value={t.id} />
                    <select
                      name="target"
                      defaultValue={t.matchedKind && t.matchedId ? `${t.matchedKind}:${t.matchedId}` : ""}
                      required
                      className="max-w-[26rem] rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    >
                      <option value="" disabled>
                        — Chọn đơn/gói BANKQR đang chờ —
                      </option>
                      {targets.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <SubmitButton className="btn-primary" pendingText="Đang khớp...">Khớp & xác nhận</SubmitButton>
                  </form>
                  <form action={ignoreBankTransactionAction}>
                    <input type="hidden" name="txnId" value={t.id} />
                    <SubmitButton className="btn-outline">Bỏ qua</SubmitButton>
                  </form>
                </div>
                {targets.length === 0 && (
                  <p className="text-xs text-amber-600">Hiện không có đơn/gói BANKQR nào đang chờ để khớp.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Gần đây ({recentTxns.length})</h2>
        {recentTxns.length === 0 ? (
          <p className="text-sm text-gray-400">Chưa có giao dịch nào.</p>
        ) : (
          <div className="space-y-2">
            {recentTxns.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-gray-100 px-4 py-2 text-sm">
                <StatusBadge status={t.status} />
                <span className="font-semibold text-gray-900">{formatVnd(t.amountVnd)}</span>
                <span className="truncate font-mono text-xs text-gray-500">{t.content || "(trống)"}</span>
                <span className="font-mono text-xs text-gray-400">{t.txnRef ?? "—"}</span>
                <span className="ml-auto text-xs text-gray-400">{new Date(t.createdAt).toLocaleString("vi-VN")}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status }: Readonly<{ status: string }>) {
  const s = STATUS_LABEL[status] ?? { text: status, cls: "bg-gray-100 text-gray-500" };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.cls}`}>{s.text}</span>;
}
