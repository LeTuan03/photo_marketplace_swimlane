import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { formatVnd } from "@/lib/money";
import { confirmBankPaymentAction, rejectBankPaymentAction } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Đối chiếu chuyển khoản thủ công: admin xem đơn/gói chờ, so biến động số dư rồi xác nhận. */
export default async function AdminPaymentsPage() {
  await requireRole("ADMIN");

  const [orders, subs] = await Promise.all([
    prisma.order.findMany({
      where: { status: "PENDING", paymentProvider: "BANKQR" },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { buyer: { select: { email: true, name: true } }, items: true },
    }),
    prisma.subscription.findMany({
      where: { status: "PENDING", paymentProvider: "BANKQR" },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { email: true, name: true } } },
    }),
  ]);

  const empty = orders.length === 0 && subs.length === 0;

  return (
    <div>
      <PageHeader
        title="Đối chiếu chuyển khoản (thủ công)"
        subtitle="Dự phòng khi tự khớp không nhận diện được. Tiền vào đúng nội dung được tự xác nhận realtime ở mục Biến động số dư."
      />

      {empty ? (
        <EmptyState title="Không có giao dịch nào đang chờ" hint="Đơn/gói chờ chuyển khoản sẽ hiện ở đây." />
      ) : (
        <div className="space-y-6">
          {orders.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-gray-700">Đơn mua ảnh ({orders.length})</h2>
              <div className="space-y-3">
                {orders.map((o) => (
                  <PaymentRow
                    key={o.id}
                    kind="order"
                    id={o.id}
                    who={o.buyer.name || o.buyer.email}
                    amount={o.totalVnd}
                    memo={o.providerTxnRef ?? ""}
                    sub={`${o.items.length} ảnh`}
                    at={o.createdAt}
                  />
                ))}
              </div>
            </section>
          )}

          {subs.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-gray-700">Đăng ký gói ({subs.length})</h2>
              <div className="space-y-3">
                {subs.map((s) => (
                  <PaymentRow
                    key={s.id}
                    kind="sub"
                    id={s.id}
                    who={s.user.name || s.user.email}
                    amount={s.priceVnd}
                    memo={s.providerTxnRef ?? ""}
                    sub={`Gói ${s.plan}`}
                    at={s.createdAt}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function PaymentRow({
  kind,
  id,
  who,
  amount,
  memo,
  sub,
  at,
}: Readonly<{
  kind: "order" | "sub";
  id: string;
  who: string;
  amount: number;
  memo: string;
  sub: string;
  at: Date;
}>) {
  return (
    <div className="card flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm">
      <div className="min-w-0">
        <p className="font-medium text-gray-900">{who}</p>
        <p className="text-xs text-gray-400">{sub} · {new Date(at).toLocaleString("vi-VN")}</p>
      </div>
      <div>
        <p className="text-xs text-gray-500">Nội dung CK</p>
        <p className="font-mono font-medium text-gray-900">{memo}</p>
      </div>
      <div>
        <p className="text-xs text-gray-500">Số tiền</p>
        <p className="font-semibold text-brand-700">{formatVnd(amount)}</p>
      </div>
      <div className="ml-auto flex gap-2">
        <form action={confirmBankPaymentAction}>
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={id} />
          <SubmitButton className="btn-primary" pendingText="Đang xác nhận...">Đã nhận tiền</SubmitButton>
        </form>
        <form action={rejectBankPaymentAction}>
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={id} />
          <SubmitButton className="btn-outline">Hủy</SubmitButton>
        </form>
      </div>
    </div>
  );
}
