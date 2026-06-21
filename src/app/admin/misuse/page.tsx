import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { LICENSE_LABELS } from "@/lib/constants";
import { reviewMisuseAction } from "../actions";
import { PageHeader, EmptyState, Alert } from "@/components/ui";

export const dynamic = "force-dynamic";

const statusBadge: Record<string, { label: string; cls: string }> = {
  OPEN: { label: "Chờ xử lý", cls: "bg-amber-100 text-amber-800" },
  UPHELD: { label: "Đã xác nhận vi phạm", cls: "bg-red-100 text-red-800" },
  REJECTED: { label: "Đã bác bỏ", cls: "bg-gray-100 text-gray-600" },
};

export default async function MisusePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireRole("ADMIN");
  const sp = await searchParams;

  const reports = await prisma.misuseReport.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      photo: { select: { id: true, title: true } },
      reporter: { select: { name: true, email: true } },
      grant: { select: { licenseType: true, buyer: { select: { name: true, email: true } } } },
    },
  });

  return (
    <div>
      <PageHeader
        title="Dùng sai phạm vi license"
        subtitle="Báo cáo ảnh bị dùng vượt phạm vi license đã mua. Xác nhận để ghi điểm phạt người giữ license."
      />

      {sp.error && <div className="mb-4"><Alert kind="error">{decodeURIComponent(sp.error)}</Alert></div>}

      {reports.length === 0 ? (
        <EmptyState title="Chưa có báo cáo dùng sai license nào" />
      ) : (
        <div className="space-y-3">
          {reports.map((r) => {
            const open = r.status === "OPEN";
            const st = statusBadge[r.status] ?? statusBadge.OPEN;
            return (
              <div key={r.id} className="card p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`badge ${st.cls}`}>{st.label}</span>
                  <Link href={`/photos/${r.photo.id}`} className="font-medium text-gray-900 hover:underline">
                    {r.photo.title}
                  </Link>
                  {r.grant && (
                    <span className="badge bg-brand-50 text-brand-700">License: {LICENSE_LABELS[r.grant.licenseType]}</span>
                  )}
                  <span className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleString("vi-VN")}</span>
                </div>

                <dl className="mt-2 space-y-1 text-xs text-gray-600">
                  <div>
                    <dt className="inline font-medium text-gray-500">Cert: </dt>
                    <dd className="inline font-mono">{r.certNo ?? "(không có)"}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-gray-500">Người giữ license: </dt>
                    <dd className="inline">{r.grant ? `${r.grant.buyer.name} · ${r.grant.buyer.email}` : "không xác định"}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-gray-500">Người báo cáo: </dt>
                    <dd className="inline">{r.reporter.name} · {r.reporter.email}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-gray-500">Nơi dùng sai: </dt>
                    <dd className="inline">
                      <a href={r.usageUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 text-brand-700 underline">
                        {r.usageUrl} <ExternalLink className="h-3 w-3" />
                      </a>
                    </dd>
                  </div>
                </dl>
                {r.detail && <p className="mt-2 text-gray-600">{r.detail}</p>}
                {!open && r.reviewNote && <p className="mt-1 text-xs text-gray-400">Ghi chú xử lý: {r.reviewNote}</p>}

                {open && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {!r.grant && (
                      <span className="text-xs text-amber-600">Không gắn được người giữ license — bác bỏ hoặc xử lý thủ công.</span>
                    )}
                    <form action={reviewMisuseAction} className="flex flex-1 flex-wrap items-center gap-2">
                      <input type="hidden" name="reportId" value={r.id} />
                      <input name="note" className="input min-w-[160px] flex-1" placeholder="Ghi chú (tuỳ chọn)" />
                      <button type="submit" name="decision" value="uphold" disabled={!r.grant} className="btn-danger disabled:cursor-not-allowed disabled:opacity-50">
                        Xác nhận vi phạm
                      </button>
                      <button type="submit" name="decision" value="reject" className="btn-outline">Bác bỏ</button>
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
