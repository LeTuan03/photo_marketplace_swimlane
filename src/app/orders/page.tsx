import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { formatVnd } from "@/lib/money";
import { LICENSE_LABELS } from "@/lib/constants";
import { PageHeader, EmptyState, OrderStatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Lịch sử MUA của người mua: mọi đơn hàng + trạng thái thanh toán + hoàn tiền (nếu có). */
export default async function OrdersPage() {
  const user = await requireUser();

  const orders = await prisma.order.findMany({
    where: { buyerId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      items: {
        include: {
          photo: { select: { id: true, title: true } },
          refunds: { select: { amountVnd: true, percent: true, status: true } },
        },
      },
    },
  });

  return (
    <div>
      <PageHeader title="Lịch sử mua" subtitle="Tất cả đơn hàng của bạn và trạng thái thanh toán / hoàn tiền." />

      {orders.length === 0 ? (
        <EmptyState
          title="Bạn chưa có đơn hàng nào"
          hint="Mua ảnh để xem lịch sử đơn ở đây."
          action={<Link href="/" className="btn-primary mt-2">Khám phá ảnh</Link>}
        />
      ) : (
        <div className="space-y-4">
          {orders.map((o) => {
            const code = o.id.slice(-8).toUpperCase();
            const canPay = o.status === "PENDING";
            const payHref = o.paymentProvider === "BANKQR" ? `/payment/bank?order=${o.id}` : o.payUrl;
            return (
              <div key={o.id} className="card p-4 text-sm">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="font-mono font-semibold text-gray-900">#{code}</span>
                  <OrderStatusBadge status={o.status} />
                  <span className="text-xs text-gray-400">{new Date(o.createdAt).toLocaleString("vi-VN")}</span>
                  {o.paymentProvider && (
                    <span className="text-xs text-gray-400">· {o.paymentProvider}</span>
                  )}
                  <div className="ml-auto text-right">
                    {o.discountVnd > 0 && (
                      <p className="text-xs text-gray-400 line-through">{formatVnd(o.subtotalVnd)}</p>
                    )}
                    <p className="font-semibold text-brand-700">{formatVnd(o.totalVnd)}</p>
                  </div>
                </div>

                <div className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
                  {o.items.map((it) => {
                    const refunded = it.refunds.reduce((s, r) => s + r.amountVnd, 0);
                    const anySettled = it.refunds.some((r) => r.status === "SETTLED");
                    return (
                      <div key={it.id} className="flex flex-wrap items-center gap-2 py-2">
                        <Link href={`/photos/${it.photo.id}`} className="font-medium text-gray-800 hover:underline">
                          {it.photo.title}
                        </Link>
                        <span className="text-xs text-gray-400">{LICENSE_LABELS[it.licenseType]}</span>
                        {it.refunds.length > 0 && (
                          <span className={`badge ${anySettled ? "bg-orange-100 text-orange-800" : "bg-amber-100 text-amber-800"}`}>
                            {anySettled ? "Đã hoàn" : "Chờ hoàn"} {formatVnd(refunded)}
                          </span>
                        )}
                        <span className="ml-auto text-gray-600">{formatVnd(it.priceVnd)}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {o.status === "PAID" && (
                    <Link href="/library" className="text-xs font-medium text-brand-700 hover:underline">
                      Tải file & xem certificate →
                    </Link>
                  )}
                  {canPay && payHref && (
                    <Link href={payHref} className="btn-primary px-3 py-1.5 text-xs">Tiếp tục thanh toán</Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
