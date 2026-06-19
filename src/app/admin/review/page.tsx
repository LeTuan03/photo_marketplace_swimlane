import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { publicAssetUrl } from "@/lib/storage";
import { formatVnd } from "@/lib/money";
import { LICENSE_LABELS } from "@/lib/constants";
import { approvePhotoAction, rejectPhotoAction } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  await requireRole("ADMIN");
  const photos = await prisma.photo.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: {
      seller: { select: { name: true, email: true, sellerTier: true } },
      category: true,
      licenses: true,
    },
  });

  return (
    <div>
      <PageHeader title="Hàng chờ duyệt" subtitle={`${photos.length} ảnh đang chờ`} />

      {photos.length === 0 ? (
        <EmptyState title="Không có ảnh nào chờ duyệt 🎉" hint="Tất cả đã được xử lý." />
      ) : (
        <div className="space-y-5">
          {photos.map((p) => (
            <div key={p.id} className="card grid gap-4 p-4 md:grid-cols-[280px_1fr]">
              <div className="overflow-hidden rounded-lg bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={publicAssetUrl(p.previewKey)} alt={p.title} className="h-full max-h-72 w-full object-contain" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{p.title}</h3>
                <p className="mt-0.5 text-sm text-gray-500">
                  {p.seller.name} ({p.seller.email}) · Tier {p.seller.sellerTier}
                  {p.category && <> · {p.category.name}</>}
                </p>
                {p.description && <p className="mt-2 text-sm text-gray-600">{p.description}</p>}

                <div className="mt-2 text-xs text-gray-500">
                  {p.width}×{p.height}px · {(p.sizeBytes / 1024 / 1024).toFixed(1)}MB ·{" "}
                  {p.hasModelRelease ? "Có model release" : "Không có model release"}
                </div>

                {p.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.tags.map((t) => (
                      <span key={t} className="badge bg-gray-100 text-gray-600">{t}</span>
                    ))}
                  </div>
                )}

                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {p.licenses.map((l) => (
                    <span key={l.id} className="badge bg-brand-50 text-brand-700">
                      {LICENSE_LABELS[l.type]}: {formatVnd(l.priceVnd)}
                    </span>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-start gap-3">
                  <form action={approvePhotoAction}>
                    <input type="hidden" name="photoId" value={p.id} />
                    <SubmitButton className="btn-primary">Duyệt</SubmitButton>
                  </form>
                  <form action={rejectPhotoAction} className="flex flex-1 items-start gap-2">
                    <input type="hidden" name="photoId" value={p.id} />
                    <input name="reason" required className="input flex-1" placeholder="Lý do từ chối (bắt buộc)" />
                    <SubmitButton className="btn-danger">Từ chối</SubmitButton>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
