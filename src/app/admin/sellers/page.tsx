import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { reviewSellerApplicationAction } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

const statusBadge: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Chờ duyệt", cls: "bg-amber-100 text-amber-800" },
  APPROVED: { label: "Đã duyệt", cls: "bg-emerald-100 text-emerald-800" },
  REJECTED: { label: "Từ chối", cls: "bg-red-100 text-red-800" },
};

/** S1: admin duyệt yêu cầu mở kênh bán. */
export default async function AdminSellersPage() {
  await requireRole("ADMIN");

  const [pending, recent] = await Promise.all([
    prisma.sellerApplication.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { name: true, email: true, createdAt: true } } },
    }),
    prisma.sellerApplication.findMany({
      where: { status: { in: ["APPROVED", "REJECTED"] } },
      orderBy: { reviewedAt: "desc" },
      take: 20,
      include: { user: { select: { name: true, email: true } } },
    }),
  ]);

  return (
    <div>
      <PageHeader title="Yêu cầu mở kênh bán" subtitle="Duyệt người mua muốn trở thành người bán (S1)." />

      {pending.length === 0 ? (
        <EmptyState title="Không có yêu cầu nào đang chờ" hint="Yêu cầu mở kênh bán sẽ hiện ở đây." />
      ) : (
        <div className="space-y-3">
          {pending.map((a) => (
            <div key={a.id} className="card p-4 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium text-gray-900">{a.user.name}</span>
                <span className="text-gray-500">{a.user.email}</span>
                <span className="text-xs text-gray-400">· gửi {new Date(a.createdAt).toLocaleString("vi-VN")}</span>
              </div>
              {a.pitch && <p className="mt-2 rounded-lg bg-gray-50 p-2 text-gray-600">{a.pitch}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <form action={reviewSellerApplicationAction} className="flex flex-1 items-center gap-2">
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="decision" value="approve" />
                  <input name="note" placeholder="Ghi chú (tuỳ chọn)" className="input flex-1" />
                  <SubmitButton className="btn-primary">Duyệt</SubmitButton>
                </form>
                <form action={reviewSellerApplicationAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="decision" value="reject" />
                  <SubmitButton className="btn-outline">Từ chối</SubmitButton>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Đã xử lý gần đây</h2>
          <div className="space-y-2 text-sm">
            {recent.map((a) => (
              <div key={a.id} className="flex items-center justify-between border-b border-gray-100 pb-2">
                <div>
                  <p className="text-gray-800">{a.user.name} · {a.user.email}</p>
                  <p className="text-xs text-gray-400">
                    {a.reviewedAt ? new Date(a.reviewedAt).toLocaleString("vi-VN") : ""}
                    {a.reviewNote ? ` · ${a.reviewNote}` : ""}
                  </p>
                </div>
                <span className={`badge ${statusBadge[a.status].cls}`}>{statusBadge[a.status].label}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
