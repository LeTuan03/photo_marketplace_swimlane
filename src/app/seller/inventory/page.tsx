import Link from "next/link";
import { Eye, EyeOff, Trash2, Pencil } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { publicAssetUrl } from "@/lib/storage";
import { formatVnd } from "@/lib/money";
import { LICENSE_LABELS, LICENSE_ORDER, DEFAULT_LICENSE_PRICE } from "@/lib/constants";
import {
  togglePhotoVisibilityAction,
  deletePhotoAction,
  updatePhotoAction,
  resubmitPhotoAction,
} from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader, EmptyState, PhotoStatusBadge, Alert } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ uploaded?: string; updated?: string; resubmitted?: string }>;
}) {
  const user = await requireRole("SELLER", "ADMIN");
  const sp = await searchParams;

  const photos = await prisma.photo.findMany({
    where: { sellerId: user.id, status: { not: "REMOVED" } },
    orderBy: { createdAt: "desc" },
    include: { licenses: true, _count: { select: { orderItems: true } } },
  });

  return (
    <div>
      <PageHeader
        title="Kho ảnh"
        subtitle={`${photos.length} ảnh`}
        action={<Link href="/seller/upload" className="btn-primary">Đăng ảnh mới</Link>}
      />

      {sp.uploaded && <div className="mb-4"><Alert kind="success">Đã tải lên! Ảnh đang chờ duyệt.</Alert></div>}
      {sp.updated && <div className="mb-4"><Alert kind="success">Đã cập nhật ảnh.</Alert></div>}
      {sp.resubmitted && <div className="mb-4"><Alert kind="success">Đã gửi lại để duyệt.</Alert></div>}

      {photos.length === 0 ? (
        <EmptyState title="Kho ảnh trống" action={<Link href="/seller/upload" className="btn-primary mt-2">Đăng ảnh đầu tiên</Link>} />
      ) : (
        <div className="space-y-3">
          {photos.map((p) => {
            const min = p.licenses.length ? Math.min(...p.licenses.map((l) => l.priceVnd)) : 0;
            return (
              <div key={p.id} className="card p-4">
                <div className="flex items-start gap-4">
                  <Link href={`/photos/${p.id}`} className="h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={publicAssetUrl(p.thumbKey)} alt={p.title} className="h-full w-full object-cover" />
                  </Link>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-gray-900">{p.title}</p>
                      <PhotoStatusBadge status={p.status} />
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Từ {formatVnd(min)} · {p.viewCount} lượt xem · {p._count.orderItems} lượt bán
                    </p>
                    {p.status === "REJECTED" && p.rejectionReason && (
                      <p className="mt-1 text-xs text-red-600">Lý do từ chối: {p.rejectionReason}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {(p.status === "LIVE" || p.status === "HIDDEN") && (
                      <form action={togglePhotoVisibilityAction}>
                        <input type="hidden" name="photoId" value={p.id} />
                        <button className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" title={p.status === "LIVE" ? "Ẩn" : "Hiện"}>
                          {p.status === "LIVE" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </form>
                    )}
                    {p.status === "REJECTED" && (
                      <form action={resubmitPhotoAction}>
                        <input type="hidden" name="photoId" value={p.id} />
                        <SubmitButton className="btn-outline">Gửi lại</SubmitButton>
                      </form>
                    )}
                    <form action={deletePhotoAction}>
                      <input type="hidden" name="photoId" value={p.id} />
                      <button className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Xóa">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </form>
                  </div>
                </div>

                {/* Sửa nhanh giá/tag/mô tả (S6) */}
                <details className="mt-3 border-t border-gray-100 pt-3">
                  <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-medium text-gray-600">
                    <Pencil className="h-3.5 w-3.5" /> Chỉnh sửa
                  </summary>
                  <form action={updatePhotoAction} className="mt-3 space-y-3">
                    <input type="hidden" name="photoId" value={p.id} />
                    <div>
                      <label className="label">Mô tả</label>
                      <textarea name="description" rows={2} defaultValue={p.description} className="input" />
                    </div>
                    <div>
                      <label className="label">Tags</label>
                      <input name="tags" defaultValue={p.tags.join(", ")} className="input" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {LICENSE_ORDER.map((type) => {
                        const cur = p.licenses.find((l) => l.type === type);
                        return (
                          <div key={type} className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 p-2 text-sm">
                            <label className="flex items-center gap-1.5">
                              <input type="checkbox" name={`on_${type}`} defaultChecked={Boolean(cur)} />
                              {LICENSE_LABELS[type]}
                            </label>
                            <input
                              name={`price_${type}`}
                              type="number"
                              min={0}
                              step={1000}
                              defaultValue={cur?.priceVnd ?? DEFAULT_LICENSE_PRICE[type]}
                              className="input max-w-[110px] text-right"
                            />
                          </div>
                        );
                      })}
                    </div>
                    <SubmitButton className="btn-primary">Lưu thay đổi</SubmitButton>
                  </form>
                </details>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
