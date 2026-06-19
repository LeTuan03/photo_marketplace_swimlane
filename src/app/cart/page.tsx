import Link from "next/link";
import { Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { publicAssetUrl } from "@/lib/storage";
import { formatVnd } from "@/lib/money";
import { LICENSE_LABELS, SIZE_LABELS } from "@/lib/constants";
import { removeCartItemAction, clearCartAction } from "./actions";
import { PageHeader, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const user = await requireUser();
  const items = await prisma.cartItem.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { photo: { select: { id: true, title: true, thumbKey: true, status: true } } },
  });

  const valid = items.filter((i) => i.photo.status === "LIVE");
  const total = valid.reduce((s, i) => s + i.priceVnd, 0);

  return (
    <div>
      <PageHeader title="Giỏ hàng" subtitle={`${valid.length} ảnh`} />

      {valid.length === 0 ? (
        <EmptyState
          title="Giỏ hàng trống"
          hint="Khám phá kho ảnh và thêm sản phẩm bạn thích."
          action={<Link href="/" className="btn-primary mt-2">Khám phá ảnh</Link>}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-3">
            {valid.map((it) => (
              <div key={it.id} className="card flex items-center gap-4 p-3">
                <Link href={`/photos/${it.photo.id}`} className="h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={publicAssetUrl(it.photo.thumbKey)} alt={it.photo.title} className="h-full w-full object-cover" />
                </Link>
                <div className="flex-1">
                  <Link href={`/photos/${it.photo.id}`} className="font-medium text-gray-900 hover:underline">
                    {it.photo.title}
                  </Link>
                  <p className="text-xs text-gray-500">
                    License: {LICENSE_LABELS[it.licenseType]} · Kích thước: {SIZE_LABELS[it.sizeLabel] ?? it.sizeLabel}
                  </p>
                </div>
                <div className="font-semibold text-gray-900">{formatVnd(it.priceVnd)}</div>
                <form action={removeCartItemAction}>
                  <input type="hidden" name="id" value={it.id} />
                  <button className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Xóa">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </form>
              </div>
            ))}
            <form action={clearCartAction}>
              <button className="text-sm text-gray-500 hover:underline">Xóa toàn bộ giỏ hàng</button>
            </form>
          </div>

          <div className="card h-fit p-5">
            <h2 className="font-semibold text-gray-900">Tóm tắt</h2>
            <div className="mt-3 flex justify-between text-sm text-gray-600">
              <span>Tạm tính</span>
              <span>{formatVnd(total)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t border-gray-100 pt-3 text-base font-semibold">
              <span>Tổng cộng</span>
              <span className="text-brand-700">{formatVnd(total)}</span>
            </div>
            <Link href="/checkout" className="btn-primary mt-4 w-full">Tiến hành thanh toán</Link>
          </div>
        </div>
      )}
    </div>
  );
}
