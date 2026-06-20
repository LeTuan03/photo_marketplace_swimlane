import { notFound } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, Ruler, FileImage, Tag, Repeat, AlertTriangle, Heart } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { publicAssetUrl } from "@/lib/storage";
import { formatVnd } from "@/lib/money";
import { LICENSE_LABELS, LICENSE_DESCRIPTIONS, LICENSE_ORDER, SIZE_LABELS } from "@/lib/constants";
import { addToCartAction, reportPhotoAction } from "@/app/cart/actions";
import { subscriptionDownloadAction } from "@/app/subscription/actions";
import { toggleWishlistAction } from "@/app/wishlist/actions";
import { submitReviewAction, deleteReviewAction } from "./actions";
import { getCurrentUser } from "@/lib/auth";
import { getQuotaState } from "@/lib/subscription";
import { SubmitButton } from "@/components/SubmitButton";
import { DownloadButton } from "@/components/DownloadButton";
import { Alert } from "@/components/ui";
import { Stars, RatingSummary } from "@/components/Stars";
import { StarInput } from "@/components/StarInput";

export const dynamic = "force-dynamic";

export default async function PhotoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; reported?: string; reviewed?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const photo = await prisma.photo.findUnique({
    where: { id },
    include: {
      seller: { select: { id: true, name: true, sellerTier: true, ratingSum: true, ratingCount: true } },
      category: true,
      licenses: true,
    },
  });
  if (!photo || (photo.status !== "LIVE" && photo.status !== "LOCKED")) notFound();

  const viewer = await getCurrentUser();
  const isOwner = viewer?.id === photo.seller.id;
  const quota = viewer ? getQuotaState(viewer) : null;
  const canSubDownload = Boolean(quota?.isActive && !isOwner && (quota!.remaining > 0 || (quota!.resetAt && quota!.resetAt <= new Date())));

  // Đánh giá + wishlist
  const [reviews, ownsGrant, myReview, wishItem] = await Promise.all([
    prisma.review.findMany({
      where: { photoId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { buyer: { select: { name: true } } },
    }),
    viewer ? prisma.downloadGrant.findFirst({ where: { buyerId: viewer.id, photoId: id } }) : null,
    viewer ? prisma.review.findUnique({ where: { photoId_buyerId: { photoId: id, buyerId: viewer.id } } }) : null,
    viewer ? prisma.wishlistItem.findUnique({ where: { userId_photoId: { userId: viewer.id, photoId: id } } }) : null,
  ]);
  const canReview = Boolean(viewer && !isOwner && ownsGrant);
  const inWishlist = Boolean(wishItem);

  await prisma.photo.update({ where: { id }, data: { viewCount: { increment: 1 } } }).catch(() => {});

  const licenses = LICENSE_ORDER.map((t) => photo.licenses.find((l) => l.type === t)).filter(
    (l): l is NonNullable<typeof l> => Boolean(l),
  );
  const sizes = ["S", "M", "L", "ORIGINAL"];

  return (
    <div>
      {sp.error && <div className="mb-4"><Alert kind="error">{decodeURIComponent(sp.error)}</Alert></div>}
      {sp.reported && <div className="mb-4"><Alert kind="success">Đã gửi báo cáo tới quản trị viên. Cảm ơn bạn!</Alert></div>}
      {sp.reviewed && <div className="mb-4"><Alert kind="success">Cảm ơn bạn đã đánh giá!</Alert></div>}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* Preview */}
        <div className="card overflow-hidden">
          <div className="bg-gray-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={publicAssetUrl(photo.previewKey)} alt={photo.title} className="max-h-[600px] w-full object-contain" />
          </div>
          <div className="p-4">
            <h1 className="text-xl font-bold text-gray-900">{photo.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
              <span>bởi <span className="font-medium text-gray-700">{photo.seller.name}</span></span>
              <span className="inline-flex items-center gap-1">
                <Stars value={photo.seller.ratingCount > 0 ? photo.seller.ratingSum / photo.seller.ratingCount : 0} size={13} />
                <span className="text-xs">người bán {photo.seller.ratingCount > 0 ? (photo.seller.ratingSum / photo.seller.ratingCount).toFixed(1) : "mới"}</span>
              </span>
              {photo.category && <span>· {photo.category.name}</span>}
            </div>
            <div className="mt-1">
              <RatingSummary sum={photo.ratingSum} count={photo.ratingCount} size={15} />
            </div>
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
            {!isOwner && (
              <form action={toggleWishlistAction} className="mb-3">
                <input type="hidden" name="photoId" value={photo.id} />
                <input type="hidden" name="next" value={`/photos/${photo.id}`} />
                <button className={`btn w-full border ${inWishlist ? "border-red-300 bg-red-50 text-red-600" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}>
                  <Heart className={`h-4 w-4 ${inWishlist ? "fill-red-500 text-red-500" : ""}`} />
                  {inWishlist ? "Đã lưu vào yêu thích" : "Lưu vào yêu thích"}
                </button>
              </form>
            )}
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

            {canSubDownload && (
              <div className="mt-3 border-t border-gray-100 pt-3">
                <DownloadButton
                  action={subscriptionDownloadAction}
                  fields={{ photoId: photo.id, sizeLabel: "ORIGINAL" }}
                  className="btn-ghost w-full border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                >
                  Tải miễn phí bằng gói {quota!.plan}
                  {quota!.limit > 0 ? ` · còn ${quota!.remaining} lượt` : " · không giới hạn"}
                </DownloadButton>
              </div>
            )}

            {photo.allowSwap && !isOwner && (
              <Link href={`/swap/new?target=${photo.id}`} className="btn-outline mt-3 w-full border-fuchsia-300 text-fuchsia-700 hover:bg-fuchsia-50">
                <Repeat className="h-4 w-4" /> Đề nghị trao đổi (swap)
              </Link>
            )}
            {photo.allowSwap && isOwner && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-500">
                <Repeat className="h-3.5 w-3.5" /> Ảnh này của bạn đang mở nhận trao đổi.
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

      {/* Đánh giá */}
      <section id="reviews" className="mt-8">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-lg font-bold text-gray-900">Đánh giá</h2>
          <RatingSummary sum={photo.ratingSum} count={photo.ratingCount} />
        </div>

        {canReview && (
          <form action={submitReviewAction} className="card mb-5 space-y-3 p-5">
            <input type="hidden" name="photoId" value={photo.id} />
            <div>
              <span className="label">Chấm sao {myReview ? "(cập nhật đánh giá của bạn)" : ""}</span>
              <StarInput defaultValue={myReview?.rating ?? 5} />
            </div>
            <textarea
              name="comment"
              rows={3}
              defaultValue={myReview?.comment ?? ""}
              className="input"
              placeholder="Chia sẻ cảm nhận về ảnh này..."
            />
            <SubmitButton className="btn-primary">{myReview ? "Cập nhật đánh giá" : "Gửi đánh giá"}</SubmitButton>
          </form>
        )}
        {canReview && myReview && (
          <form action={deleteReviewAction} className="-mt-3 mb-5">
            <input type="hidden" name="reviewId" value={myReview.id} />
            <SubmitButton className="btn-ghost text-sm text-red-600">Xoá đánh giá của tôi</SubmitButton>
          </form>
        )}
        {viewer && !isOwner && !canReview && (
          <p className="mb-4 text-sm text-gray-500">Bạn cần mua hoặc nhận ảnh này để có thể đánh giá.</p>
        )}

        {reviews.length === 0 ? (
          <p className="text-sm text-gray-500">Chưa có đánh giá nào. Hãy là người đầu tiên!</p>
        ) : (
          <div className="space-y-3">
            {reviews.map((r) => (
              <div key={r.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-800">{r.buyer.name}</span>
                  <span className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleDateString("vi-VN")}</span>
                </div>
                <div className="mt-1"><Stars value={r.rating} size={14} /></div>
                {r.comment && <p className="mt-2 text-sm text-gray-600">{r.comment}</p>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
