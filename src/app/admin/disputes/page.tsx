import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { resolveDisputeAction } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader, EmptyState, Alert } from "@/components/ui";

export const dynamic = "force-dynamic";

const reasonLabel: Record<string, string> = {
  FILE_ERROR: "File lỗi / sai độ phân giải",
  WRONG_DESC: "Nội dung khác mô tả",
  DMCA: "Vi phạm bản quyền (DMCA)",
  OTHER: "Khác",
};

export default async function DisputesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireRole("ADMIN");
  const sp = await searchParams;

  const disputes = await prisma.dispute.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 50,
    include: { photo: { select: { id: true, title: true } } },
  });

  return (
    <div>
      <PageHeader title="Tranh chấp & Báo cáo" subtitle="Xử lý khiếu nại, file lỗi, DMCA (AD7/AD8)." />

      {sp.error && <div className="mb-4"><Alert kind="error">{decodeURIComponent(sp.error)}</Alert></div>}

      {disputes.length === 0 ? (
        <EmptyState title="Không có tranh chấp nào" />
      ) : (
        <div className="space-y-3">
          {disputes.map((d) => {
            const open = d.status === "OPEN";
            // CHỈ hoàn được khi tranh chấp gắn đúng giao dịch của người khiếu nại.
            const refundable = Boolean(d.orderItemId);
            return (
              <div key={d.id} className="card p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`badge ${d.reason === "DMCA" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                    {reasonLabel[d.reason] ?? d.reason}
                  </span>
                  {d.photo && (
                    <Link href={`/photos/${d.photo.id}`} className="font-medium text-gray-900 hover:underline">
                      {d.photo.title}
                    </Link>
                  )}
                  <span className="text-xs text-gray-400">{new Date(d.createdAt).toLocaleString("vi-VN")}</span>
                  {!open && <span className="badge bg-gray-100 text-gray-600">{d.resolution}</span>}
                </div>
                {d.detail && <p className="mt-2 text-gray-600">{d.detail}</p>}

                {open && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {refundable ? (
                      <form action={resolveDisputeAction} className="flex items-center gap-2">
                        <input type="hidden" name="disputeId" value={d.id} />
                        <input type="hidden" name="decision" value="refund" />
                        <div className="flex items-center gap-1">
                          <input name="percent" type="number" min={1} max={100} defaultValue={100} className="input w-20 text-right" title="% hoàn" />
                          <span className="text-xs text-gray-500">%</span>
                        </div>
                        <SubmitButton className="btn-danger">Hoàn tiền người mua</SubmitButton>
                      </form>
                    ) : (
                      <span className="text-xs text-gray-400">Không gắn giao dịch mua — không thể tự hoàn tiền (đối chiếu thủ công).</span>
                    )}
                    <form action={resolveDisputeAction}>
                      <input type="hidden" name="disputeId" value={d.id} />
                      <input type="hidden" name="decision" value="reject" />
                      <SubmitButton className="btn-outline">Bác bỏ khiếu nại</SubmitButton>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
