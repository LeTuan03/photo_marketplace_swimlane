import { notFound } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, Ruler, FileImage, Tag, Repeat, AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { publicAssetUrl } from "@/lib/storage";
import { formatVnd } from "@/lib/money";
import { LICENSE_LABELS, LICENSE_DESCRIPTIONS, LICENSE_ORDER, SIZE_LABELS } from "@/lib/constants";
import { addToCartAction, reportPhotoAction } from "@/app/cart/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PhotoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; reported?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const photo = await prisma.photo.findUnique({
    where: { id },
    include: {
      seller: { select: { id: true, name: true, sellerTier: true } },
      category: true,
      licenses: true,
    },
  });
  if (!photo || (photo.status !== "LIVE" && photo.status !== "LOCKED")) notFound();

  await prisma.photo.update({ where: { id }, data: { viewCount: { increment: 1 } } }).catch(() => {});

  const licenses = LICENSE_ORDER.map((t) => photo.licenses.find((l) => l.type === t)).filter(
    (l): l is NonNullable<typeof l> => Boolean(l),
  );
  const sizes = ["S", "M", "L", "ORIGINAL"];

  return (
    <div>
      {sp.error && <div className="mb-4"><Alert kind="error">{decodeURIComponent(sp.error)}</Alert></div>}
      {sp.reported && <div className="mb-4"><Alert kind="success">Đã gửi báo cáo tới quản trị viên. Cảm ơn bạn!</Alert></div>}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* Preview */}
        <div className="card overflow-hidden">
          <div className="bg-gray-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={publicAssetUrl(photo.previewKey)} alt={photo.title} className="max-h-[600px] w-full object-contain" />
          </div>
          <div className="p-4">
            <h1 className="text-xl font-bold text-gray-900">{photo.title}</h1>
            <p className="mt-1 text-sm text-gray-500">
              bởi <span className="font-medium text-gray-700">{photo.seller.name}</span>
              {photo.category && <> · {photo.category.name}</>}
            </p>
            {photo.description && <p className="mt-3 text-sm text-gray-600">{photo.description}</p>}

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-gray-600 sm:grid-cols-3">
              <div className="flex items-center gap-2"><Ruler className="h-4 w-4 text-gray-400" />{photo.width}×{photo.height}px</div>
              <div className="flex items-center gap-2"><FileImage className="h-4 w-4 text-gray-400" />{photo.format.toUpperCase()} · {(photo.sizeBytes / 1024 / 1024).toFixed(1)}MB</div>
              {photo.hasModelRelease && <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-500" />Có model release</div>}
            </div>

            {photo.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Tag className="h-4 w-4 text-gray-400" />
                {photo.tags.map((t) => (
                  <Link key={t} href={`/?q=${encodeURIComponent(t)}`} className="badge bg-gray-100 text-gray-600 hover:bg-gray-200">
                    {t}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Mua */}
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="mb-3 font-semibold text-gray-900">Chọn license & kích thước</h2>
            <form action={addToCartAction} className="space-y-4">
              <input type="hidden" name="photoId" value={photo.id} />

              <div className="space-y-2">
                {licenses.map((l, i) => (
                  <label key={l.type} className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 hover:border-brand-400 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                    <input type="radio" name="licenseType" value={l.type} defaultChecked={i === 0} className="mt-1" required />
                    <span className="flex-1">
                      <span className="flex items-center justify-between">
                        <span className="font-medium text-gray-900">{LICENSE_LABELS[l.type]}</span>
                        <span className="font-semibold text-brand-700">{formatVnd(l.priceVnd)}</span>
                      </span>
                      <span className="mt-0.5 block text-xs text-gray-500">{LICENSE_DESCRIPTIONS[l.type]}</span>
                    </span>
                  </label>
                ))}
              </div>

              <div>
                <label className="label">Kích thước tải</label>
                <select name="sizeLabel" defaultValue="ORIGINAL" className="input">
                  {sizes.map((s) => (
                    <option key={s} value={s}>{SIZE_LABELS[s]}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                <SubmitButton className="btn-outline flex-1">Thêm vào giỏ</SubmitButton>
                <button name="buyNow" value="1" className="btn-primary flex-1">Mua ngay</button>
              </div>
            </form>

            {photo.allowSwap && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-fuchsia-700">
                <Repeat className="h-3.5 w-3.5" /> Người bán chấp nhận trao đổi (swap) ảnh.
              </p>
            )}
          </div>

          <div className="card p-5">
            <p className="text-sm text-gray-600">
              ✓ Tải file gốc kèm certificate license<br />
              ✓ Link tải hết hạn sau 24h, tải lại tối đa 3 lần<br />
              ✓ Thanh toán giữ trong escrow 7 ngày để bảo vệ người mua
            </p>
          </div>

          {/* Báo cáo (B9/B10) */}
          <details className="card p-4">
            <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-600">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Báo cáo ảnh này
            </summary>
            <form action={reportPhotoAction} className="mt-3 space-y-2">
              <input type="hidden" name="photoId" value={photo.id} />
              <select name="reason" className="input">
                <option value="FILE_ERROR">File lỗi / sai độ phân giải</option>
                <option value="WRONG_DESC">Nội dung khác mô tả</option>
                <option value="DMCA">Vi phạm bản quyền (DMCA)</option>
                <option value="OTHER">Khác</option>
              </select>
              <textarea name="detail" rows={2} className="input" placeholder="Mô tả chi tiết (tùy chọn)" />
              <SubmitButton className="btn-danger w-full">Gửi báo cáo</SubmitButton>
            </form>
          </details>
        </div>
      </div>
    </div>
  );
}
