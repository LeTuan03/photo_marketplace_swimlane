import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { resolveDmcaAction } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminDmcaPage() {
  await requireRole("ADMIN");
  const claims = await prisma.dmcaClaim.findMany({
    where: { status: { in: ["OPEN", "COUNTERED"] } },
    orderBy: [{ status: "desc" }, { createdAt: "asc" }],
    include: {
      photo: { select: { id: true, title: true, seller: { select: { name: true } } } },
      claimant: { select: { name: true, email: true } },
    },
  });

  return (
    <div>
      <PageHeader title="Khiếu nại DMCA" subtitle="Xử lý claim & phản biện bản quyền (AD7)." />

      {claims.length === 0 ? (
        <EmptyState title="Không có khiếu nại DMCA nào" />
      ) : (
        <div className="space-y-4">
          {claims.map((c) => {
            const overdue = c.status === "OPEN" && c.deadline < new Date();
            return (
              <div key={c.id} className="card p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`badge ${c.status === "COUNTERED" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
                    {c.status === "COUNTERED" ? "Đã phản biện" : "Chờ phản biện"}
                  </span>
                  <Link href={`/photos/${c.photo.id}`} className="font-medium text-gray-900 hover:underline">
                    {c.photo.title}
                  </Link>
                  <span className="text-xs text-gray-400">
                    người bán: {c.photo.seller.name} · hạn {new Date(c.deadline).toLocaleDateString("vi-VN")}
                    {overdue && " (quá hạn)"}
                  </span>
                </div>

                <div className="mt-2 rounded-lg bg-gray-50 p-2">
                  <p className="text-xs font-medium text-gray-500">Bên khiếu nại: {c.claimant.name} ({c.claimant.email})</p>
                  <p className="mt-0.5 text-gray-700">{c.evidence || "(không có mô tả)"}</p>
                </div>

                {c.counterStatement && (
                  <div className="mt-2 rounded-lg bg-blue-50 p-2">
                    <p className="text-xs font-medium text-blue-700">Phản biện của người bán:</p>
                    <p className="mt-0.5 text-gray-700">{c.counterStatement}</p>
                  </div>
                )}

                <form action={resolveDmcaAction} className="mt-3 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="claimId" value={c.id} />
                  <input name="note" className="input max-w-xs" placeholder="Ghi chú phán quyết (tùy chọn)" />
                  <button name="decision" value="uphold" className="btn-danger">Chấp nhận → gỡ ảnh</button>
                  <button name="decision" value="reject" className="btn-outline">Bác → khôi phục ảnh</button>
                </form>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
