import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { resolveDisputeAction } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

const reasonLabel: Record<string, string> = {
  FILE_ERROR: "File lỗi / sai độ phân giải",
  WRONG_DESC: "Nội dung khác mô tả",
  DMCA: "Vi phạm bản quyền (DMCA)",
  OTHER: "Khác",
};

export default async function DisputesPage() {
  await requireRole("ADMIN");

  const disputes = await prisma.dispute.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 50,
    include: { photo: { select: { id: true, title: true } } },
  });

  // tìm orderItem gần nhất của ảnh để hoàn tiền (nếu có)
  const photoIds = disputes.map((d) => d.photoId).filter(Boolean) as string[];
  const latestItems = await prisma.orderItem.findMany({
    where: { photoId: { in: photoIds }, order: { status: "PAID" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, photoId: true },
  });
  const itemByPhoto = new Map<string, string>();
  for (const it of latestItems) if (!itemByPhoto.has(it.photoId)) itemByPhoto.set(it.photoId, it.id);

  return (
    <div>
      <PageHeader title="Tranh chấp & Báo cáo" subtitle="Xử lý khiếu nại, file lỗi, DMCA (AD7/AD8)." />

      {disputes.length === 0 ? (
        <EmptyState title="Không có tranh chấp nào" />
      ) : (
        <div className="space-y-3">
          {disputes.map((d) => {
            const open = d.status === "OPEN";
            const orderItemId = d.photoId ? itemByPhoto.get(d.photoId) ?? "" : "";
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
                  <div className="mt-3 flex gap-2">
                    <form action={resolveDisputeAction}>
                      <input type="hidden" name="disputeId" value={d.id} />
                      <input type="hidden" name="orderItemId" value={orderItemId} />
                      <input type="hidden" name="decision" value="refund" />
                      <SubmitButton className="btn-danger">
                        {d.reason === "DMCA" ? "Gỡ ảnh + hoàn tiền" : "Hoàn tiền người mua"}
                      </SubmitButton>
                    </form>
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
