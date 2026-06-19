import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatVnd, formatNumber } from "@/lib/money";
import { PageHeader, StatCard } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const [gmvAgg, paidOrders, sellers, buyers, livePhotos, pendingPhotos, rejectedPhotos, escrowHeld, topPhotos] =
    await Promise.all([
      prisma.order.aggregate({ where: { status: "PAID" }, _sum: { totalVnd: true, platformFeeVnd: true } }),
      prisma.order.count({ where: { status: "PAID" } }),
      prisma.user.count({ where: { role: "SELLER" } }),
      prisma.user.count({ where: { role: "BUYER" } }),
      prisma.photo.count({ where: { status: "LIVE" } }),
      prisma.photo.count({ where: { status: "PENDING" } }),
      prisma.photo.count({ where: { status: "REJECTED" } }),
      prisma.escrowHold.aggregate({ where: { status: "HELD" }, _sum: { amountVnd: true } }),
      prisma.photo.findMany({
        where: { salesCount: { gt: 0 } },
        orderBy: { salesCount: "desc" },
        take: 5,
        include: { seller: { select: { name: true } } },
      }),
    ]);

  const gmv = gmvAgg._sum.totalVnd ?? 0;
  const revenue = gmvAgg._sum.platformFeeVnd ?? 0;
  const reviewed = livePhotos + rejectedPhotos;
  const approvalRate = reviewed > 0 ? Math.round((livePhotos / reviewed) * 100) : 0;

  return (
    <div>
      <PageHeader title="Tổng quan & Báo cáo" subtitle="Chỉ số vận hành nền tảng (BI)." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Tổng GMV (đã TT)" value={formatVnd(gmv)} hint={`${paidOrders} đơn`} />
        <StatCard label="Doanh thu nền tảng" value={formatVnd(revenue)} hint="Tổng hoa hồng" />
        <StatCard label="Đang giữ escrow" value={formatVnd(escrowHeld._sum.amountVnd ?? 0)} />
        <StatCard label="Tỷ lệ duyệt" value={`${approvalRate}%`} hint={`${livePhotos} live / ${rejectedPhotos} từ chối`} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Người bán" value={formatNumber(sellers)} />
        <StatCard label="Người mua" value={formatNumber(buyers)} />
        <StatCard label="Ảnh đang bán" value={formatNumber(livePhotos)} />
        <StatCard label="Chờ duyệt" value={formatNumber(pendingPhotos)} hint={pendingPhotos > 0 ? "Cần xử lý" : "Đã xong"} />
      </div>

      <h2 className="mb-3 mt-8 font-semibold text-gray-900">Top ảnh bán chạy</h2>
      {topPhotos.length === 0 ? (
        <div className="card p-6 text-sm text-gray-500">Chưa có dữ liệu bán hàng.</div>
      ) : (
        <div className="card divide-y divide-gray-100">
          {topPhotos.map((p, i) => (
            <div key={p.id} className="flex items-center justify-between p-4 text-sm">
              <div className="flex items-center gap-3">
                <span className="font-bold text-gray-400">#{i + 1}</span>
                <div>
                  <Link href={`/photos/${p.id}`} className="font-medium text-gray-900 hover:underline">{p.title}</Link>
                  <p className="text-xs text-gray-500">bởi {p.seller.name}</p>
                </div>
              </div>
              <span className="badge bg-emerald-100 text-emerald-800">{p.salesCount} lượt bán</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex gap-2">
        <Link href="/admin/review" className="btn-outline">Tới hàng chờ duyệt</Link>
        <Link href="/admin/disputes" className="btn-outline">Xử lý tranh chấp</Link>
      </div>
    </div>
  );
}
