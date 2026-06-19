import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { formatVnd } from "@/lib/money";
import { processPayoutAction } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader, EmptyState, PayoutStatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminPayoutsPage() {
  await requireRole("ADMIN");
  const payouts = await prisma.payout.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 50,
    include: { seller: { select: { name: true, email: true } } },
  });

  return (
    <div>
      <PageHeader title="Yêu cầu rút tiền" subtitle="Duyệt chi trả cho người bán (TT6)." />

      {payouts.length === 0 ? (
        <EmptyState title="Không có yêu cầu rút tiền" />
      ) : (
        <div className="space-y-3">
          {payouts.map((p) => (
            <div key={p.id} className="card flex flex-wrap items-center gap-3 p-4 text-sm">
              <div className="min-w-[200px] flex-1">
                <p className="font-medium text-gray-900">{p.seller.name}</p>
                <p className="text-xs text-gray-500">{p.seller.email}</p>
                <p className="mt-1 text-xs text-gray-500">{p.method} · {p.destination}</p>
              </div>
              <span className="text-base font-semibold text-gray-900">{formatVnd(p.amountVnd)}</span>
              <PayoutStatusBadge status={p.status} />
              {p.status === "REQUESTED" && (
                <div className="flex gap-2">
                  <form action={processPayoutAction}>
                    <input type="hidden" name="payoutId" value={p.id} />
                    <input type="hidden" name="action" value="pay" />
                    <SubmitButton className="btn-primary">Đã chi trả</SubmitButton>
                  </form>
                  <form action={processPayoutAction}>
                    <input type="hidden" name="payoutId" value={p.id} />
                    <input type="hidden" name="action" value="reject" />
                    <SubmitButton className="btn-outline">Từ chối (hoàn ví)</SubmitButton>
                  </form>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
