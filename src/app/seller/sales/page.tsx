import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { formatVnd } from "@/lib/money";
import { LICENSE_LABELS } from "@/lib/constants";
import { PageHeader, EmptyState, StatCard, EscrowStatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Lịch sử BÁN của người bán: các item đã bán + escrow + hoàn tiền (nếu có). */
export default async function SellerSalesPage() {
  const user = await requireRole("SELLER", "ADMIN");

  const [items, agg] = await Promise.all([
    prisma.orderItem.findMany({
      where: { sellerId: user.id, order: { status: "PAID" } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        photo: { select: { id: true, title: true } },
        escrow: { select: { status: true } },
        refunds: { select: { percent: true, status: true } },
      },
    }),
    prisma.orderItem.aggregate({
      where: { sellerId: user.id, order: { status: "PAID" } },
      _sum: { priceVnd: true, sellerEarningVnd: true },
      _count: true,
    }),
  ]);

  const gross = agg._sum.priceVnd ?? 0;
  const net = agg._sum.sellerEarningVnd ?? 0;

  return (
    <div>
      <PageHeader title="Lịch sử bán" subtitle="Các ảnh đã bán, doanh thu sau phí và trạng thái escrow." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Lượt bán" value={String(agg._count)} />
        <StatCard label="Tổng doanh thu (gộp)" value={formatVnd(gross)} />
        <StatCard label="Thực nhận (sau phí)" value={formatVnd(net)} hint="Trước khi trừ hoàn tiền (nếu có)" />
      </div>

      <div className="mt-6">
        {items.length === 0 ? (
          <EmptyState
            title="Chưa có lượt bán nào"
            hint="Khi có người mua ảnh của bạn, giao dịch sẽ hiển thị ở đây."
            action={<Link href="/seller/upload" className="btn-primary mt-2">Đăng ảnh mới</Link>}
          />
        ) : (
          <div className="card divide-y divide-gray-100">
            {items.map((it) => {
              const refundedPct = it.refunds.reduce((s, r) => s + r.percent, 0);
              return (
                <div key={it.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 text-sm">
                  <div className="min-w-0">
                    <Link href={`/photos/${it.photo.id}`} className="font-medium text-gray-900 hover:underline">
                      {it.photo.title}
                    </Link>
                    <p className="text-xs text-gray-400">
                      {LICENSE_LABELS[it.licenseType]} · {new Date(it.createdAt).toLocaleString("vi-VN")}
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-3">
                    {refundedPct > 0 && (
                      <span className="badge bg-orange-100 text-orange-800">Hoàn {Math.min(100, refundedPct)}%</span>
                    )}
                    {it.escrow && <EscrowStatusBadge status={it.escrow.status} />}
                    <div className="text-right">
                      <p className="font-medium text-emerald-700">+{formatVnd(it.sellerEarningVnd)}</p>
                      <p className="text-xs text-gray-400">giá {formatVnd(it.priceVnd)} · phí {formatVnd(it.platformFeeVnd)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
