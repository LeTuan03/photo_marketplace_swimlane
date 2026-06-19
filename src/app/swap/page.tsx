import Link from "next/link";
import { ArrowLeftRight, Check, X } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { publicAssetUrl } from "@/lib/storage";
import { formatVnd } from "@/lib/money";
import { expireStaleSwaps } from "@/lib/swap";
import { respondSwapAction, confirmSwapAction, cancelSwapAction } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader, EmptyState, SwapStatusBadge, Alert } from "@/components/ui";
import { Stars } from "@/components/Stars";

export const dynamic = "force-dynamic";

type OfferWithPhotos = Awaited<ReturnType<typeof loadOffers>>["received"][number];

async function loadOffers(userId: string) {
  const include = {
    offeredPhoto: { select: { id: true, title: true, thumbKey: true } },
    requestedPhoto: { select: { id: true, title: true, thumbKey: true } },
    initiator: { select: { name: true, ratingSum: true, ratingCount: true } },
    responder: { select: { name: true, ratingSum: true, ratingCount: true } },
  };
  const [received, sent] = await Promise.all([
    prisma.swapOffer.findMany({ where: { responderId: userId }, orderBy: { createdAt: "desc" }, include }),
    prisma.swapOffer.findMany({ where: { initiatorId: userId }, orderBy: { createdAt: "desc" }, include }),
  ]);
  return { received, sent };
}

function PhotoMini({ label, photo }: { label: string; photo: { id: string; title: string; thumbKey: string } }) {
  return (
    <Link href={`/photos/${photo.id}`} className="flex items-center gap-2">
      <div className="h-14 w-20 overflow-hidden rounded-md bg-gray-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={publicAssetUrl(photo.thumbKey)} alt={photo.title} className="h-full w-full object-cover" />
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
        <p className="max-w-[140px] truncate text-sm font-medium text-gray-800">{photo.title}</p>
      </div>
    </Link>
  );
}

function OfferCard({ offer, role }: { offer: OfferWithPhotos; role: "received" | "sent" }) {
  const confirmed = role === "received" ? offer.responderConfirmed : offer.initiatorConfirmed;
  const other = role === "received" ? offer.initiator : offer.responder;
  const otherAvg = other.ratingCount > 0 ? other.ratingSum / other.ratingCount : 0;

  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <SwapStatusBadge status={offer.status} />
          <span>· với {other.name}</span>
          {other.ratingCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <Stars value={otherAvg} size={12} /> <span className="text-xs">{otherAvg.toFixed(1)}</span>
            </span>
          )}
        </div>
        {offer.suggestedTopUpVnd > 0 && (
          <span className="badge bg-amber-100 text-amber-800">Gợi ý bù {formatVnd(offer.suggestedTopUpVnd)}</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PhotoMini label={role === "received" ? "Họ đưa" : "Bạn đưa"} photo={offer.offeredPhoto} />
        <ArrowLeftRight className="h-5 w-5 text-gray-400" />
        <PhotoMini label={role === "received" ? "Đổi ảnh của bạn" : "Bạn muốn"} photo={offer.requestedPhoto} />
      </div>

      {offer.message && <p className="mt-3 rounded-lg bg-gray-50 p-2 text-sm text-gray-600">“{offer.message}”</p>}

      {/* Hành động */}
      <div className="mt-3 flex flex-wrap gap-2">
        {offer.status === "PENDING" && role === "received" && (
          <>
            <form action={respondSwapAction}>
              <input type="hidden" name="offerId" value={offer.id} />
              <input type="hidden" name="decision" value="accept" />
              <SubmitButton className="btn-primary"><Check className="h-4 w-4" /> Chấp nhận</SubmitButton>
            </form>
            <form action={respondSwapAction}>
              <input type="hidden" name="offerId" value={offer.id} />
              <input type="hidden" name="decision" value="decline" />
              <SubmitButton className="btn-outline"><X className="h-4 w-4" /> Từ chối</SubmitButton>
            </form>
          </>
        )}

        {offer.status === "PENDING" && role === "sent" && (
          <form action={cancelSwapAction}>
            <input type="hidden" name="offerId" value={offer.id} />
            <SubmitButton className="btn-outline">Thu hồi đề nghị</SubmitButton>
          </form>
        )}

        {offer.status === "ACCEPTED" && (
          <>
            {confirmed ? (
              <span className="badge bg-emerald-100 text-emerald-800">Bạn đã xác nhận · chờ bên kia</span>
            ) : (
              <form action={confirmSwapAction}>
                <input type="hidden" name="offerId" value={offer.id} />
                <SubmitButton className="btn-primary">Ký xác nhận cuối</SubmitButton>
              </form>
            )}
            <form action={cancelSwapAction} className="flex items-center gap-2">
              <input type="hidden" name="offerId" value={offer.id} />
              <input name="reason" placeholder="Lý do huỷ" className="input max-w-[160px] py-1 text-xs" />
              <SubmitButton className="btn-danger">Huỷ</SubmitButton>
            </form>
          </>
        )}

        {offer.status === "COMPLETED" && (
          <Link href="/library" className="btn-outline">Xem trong thư viện</Link>
        )}
      </div>
    </div>
  );
}

export default async function SwapPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  await expireStaleSwaps();
  const { received, sent } = await loadOffers(user.id);

  return (
    <div>
      <PageHeader title="Trao đổi ảnh (Swap)" subtitle="Đề nghị đổi ảnh trực tiếp giữa hai người dùng." />
      {sp.sent && <div className="mb-4"><Alert kind="success">Đã gửi đề nghị! Người nhận có 48h để trả lời.</Alert></div>}
      {sp.error && <div className="mb-4"><Alert kind="error">{decodeURIComponent(sp.error)}</Alert></div>}

      <h2 className="mb-3 font-semibold text-gray-900">Đề nghị nhận được ({received.length})</h2>
      {received.length === 0 ? (
        <div className="mb-8"><EmptyState title="Chưa có đề nghị nào gửi đến bạn" /></div>
      ) : (
        <div className="mb-8 space-y-3">
          {received.map((o) => (
            <OfferCard key={o.id} offer={o} role="received" />
          ))}
        </div>
      )}

      <h2 className="mb-3 font-semibold text-gray-900">Đề nghị đã gửi ({sent.length})</h2>
      {sent.length === 0 ? (
        <EmptyState
          title="Bạn chưa gửi đề nghị nào"
          hint="Vào một ảnh có nhận trao đổi và bấm 'Đề nghị trao đổi'."
          action={<Link href="/" className="btn-primary mt-2">Khám phá ảnh</Link>}
        />
      ) : (
        <div className="space-y-3">
          {sent.map((o) => (
            <OfferCard key={o.id} offer={o} role="sent" />
          ))}
        </div>
      )}
    </div>
  );
}
