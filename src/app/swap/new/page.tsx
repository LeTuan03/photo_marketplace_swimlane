import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { publicAssetUrl } from "@/lib/storage";
import { formatVnd } from "@/lib/money";
import { representativePrice, computeSuggestedTopUp } from "@/lib/swap";
import { createSwapOfferAction } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader, EmptyState, Alert } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function NewSwapPage({
  searchParams,
}: {
  searchParams: Promise<{ target?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  if (!sp.target) redirect("/");

  const target = await prisma.photo.findUnique({
    where: { id: sp.target },
    include: { seller: { select: { name: true } }, licenses: true },
  });
  if (!target || target.status !== "LIVE" || !target.allowSwap) notFound();
  if (target.sellerId === user.id) redirect(`/photos/${target.id}?error=Đây là ảnh của bạn`);

  const myPhotos = await prisma.photo.findMany({
    where: { sellerId: user.id, status: "LIVE", allowSwap: true },
    include: { licenses: true },
    orderBy: { createdAt: "desc" },
  });

  const targetPrice = representativePrice(target.licenses);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Đề nghị trao đổi" subtitle="Chọn 1 ảnh của bạn để đổi lấy ảnh bên dưới." />
      {sp.error && <div className="mb-4"><Alert kind="error">{decodeURIComponent(sp.error)}</Alert></div>}

      <div className="mb-5 card flex items-center gap-4 p-4">
        <div className="h-24 w-32 overflow-hidden rounded-lg bg-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={publicAssetUrl(target.thumbKey)} alt={target.title} className="h-full w-full object-cover" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400">Bạn muốn nhận</p>
          <p className="font-semibold text-gray-900">{target.title}</p>
          <p className="text-sm text-gray-500">bởi {target.seller.name} · giá tham chiếu {formatVnd(targetPrice)}</p>
        </div>
      </div>

      {myPhotos.length === 0 ? (
        <EmptyState
          title="Bạn chưa có ảnh nào để trao đổi"
          hint="Cần ít nhất 1 ảnh đang bán và bật 'Cho phép trao đổi'."
          action={<Link href="/seller/upload" className="btn-primary mt-2">Đăng ảnh</Link>}
        />
      ) : (
        <form action={createSwapOfferAction} className="card space-y-4 p-5">
          <input type="hidden" name="requestedPhotoId" value={target.id} />
          <div>
            <p className="label">Chọn ảnh của bạn để đề nghị đổi</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {myPhotos.map((p, i) => {
                const price = representativePrice(p.licenses);
                const topUp = computeSuggestedTopUp(price, targetPrice);
                return (
                  <label key={p.id} className="cursor-pointer overflow-hidden rounded-lg border border-gray-200 has-[:checked]:border-brand-500 has-[:checked]:ring-2 has-[:checked]:ring-brand-100">
                    <input type="radio" name="offeredPhotoId" value={p.id} defaultChecked={i === 0} className="hidden" />
                    <div className="aspect-[4/3] bg-gray-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={publicAssetUrl(p.thumbKey)} alt={p.title} className="h-full w-full object-cover" />
                    </div>
                    <div className="p-2">
                      <p className="truncate text-xs font-medium text-gray-800">{p.title}</p>
                      <p className="text-[11px] text-gray-500">{formatVnd(price)}</p>
                      {topUp > 0 && <p className="text-[11px] text-amber-600">Lệch giá &gt;30% · gợi ý bù {formatVnd(topUp)}</p>}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
          <div>
            <label className="label">Lời nhắn (tùy chọn)</label>
            <textarea name="message" rows={2} className="input" placeholder="Ví dụ: Mình rất thích bức này, đổi nhé!" />
          </div>
          <SubmitButton className="btn-primary w-full">
            <ArrowLeftRight className="h-4 w-4" /> Gửi đề nghị trao đổi
          </SubmitButton>
          <p className="text-xs text-gray-400">Người nhận có 48h để chấp nhận. Khi cả hai xác nhận, 2 ảnh sẽ được cấp quyền tải chéo kèm certificate.</p>
        </form>
      )}
    </div>
  );
}
