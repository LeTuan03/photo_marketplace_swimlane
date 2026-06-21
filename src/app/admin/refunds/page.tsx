import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { formatVnd } from "@/lib/money";
import { settleRefundAction } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

/** TT5: sổ hoàn tiền cho người mua — admin chi tiền ngoài hệ thống rồi đánh dấu đã chi. */
export default async function AdminRefundsPage() {
  await requireRole("ADMIN");

  const [pending, settled] = await Promise.all([
    prisma.refundRecord.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        buyer: { select: { email: true, name: true } },
        orderItem: { include: { photo: { select: { title: true } } } },
      },
    }),
    prisma.refundRecord.findMany({
      where: { status: "SETTLED" },
      orderBy: { settledAt: "desc" },
      take: 20,
      include: {
        buyer: { select: { email: true, name: true } },
        orderItem: { include: { photo: { select: { title: true } } } },
      },
    }),
  ]);

  const pendingTotal = pending.reduce((s, r) => s + r.amountVnd, 0);

  return (
    <div>
      <PageHeader
        title="Hoàn tiền người mua"
        subtitle="Khoản đã duyệt hoàn — chuyển tiền cho người mua (ngoài hệ thống) rồi bấm xác nhận đã chi."
      />

      {pending.length === 0 ? (
        <EmptyState title="Không có khoản hoàn nào đang chờ chi" hint="Khoản hoàn tiền đã duyệt sẽ hiện ở đây để đối soát." />
      ) : (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-700">
            Chờ chi ({pending.length}) · tổng {formatVnd(pendingTotal)}
          </h2>
          <div className="space-y-3">
            {pending.map((r) => (
              <div key={r.id} className="card flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">{r.buyer.name || r.buyer.email}</p>
                  <p className="text-xs text-gray-400">
                    {r.orderItem.photo.title} · {new Date(r.createdAt).toLocaleString("vi-VN")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Lý do</p>
                  <p className="text-gray-800">{r.reason || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Số tiền hoàn</p>
                  <p className="font-semibold text-brand-700">
                    {formatVnd(r.amountVnd)} <span className="text-xs font-normal text-gray-400">({r.percent}%)</span>
                  </p>
                </div>
                <form action={settleRefundAction} className="ml-auto flex items-center gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <input name="note" placeholder="Ghi chú (tuỳ chọn)" className="input w-44" />
                  <SubmitButton className="btn-primary" pendingText="Đang lưu...">Đã hoàn tiền</SubmitButton>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}

      {settled.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Đã chi gần đây</h2>
          <div className="space-y-2 text-sm">
            {settled.map((r) => (
              <div key={r.id} className="flex items-center justify-between border-b border-gray-100 pb-2">
                <div>
                  <p className="text-gray-800">
                    {r.buyer.name || r.buyer.email} · {r.orderItem.photo.title}
                  </p>
                  <p className="text-xs text-gray-400">
                    {r.settledAt ? new Date(r.settledAt).toLocaleString("vi-VN") : ""}
                    {r.note ? ` · ${r.note}` : ""}
                  </p>
                </div>
                <span className="font-medium text-gray-600">{formatVnd(r.amountVnd)} ({r.percent}%)</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
