import Link from "next/link";
import { Heart } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { PhotoCard } from "@/components/PhotoCard";
import { PageHeader, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function WishlistPage() {
  const user = await requireUser();

  const items = await prisma.wishlistItem.findMany({
    where: { userId: user.id, photo: { status: "LIVE" } },
    orderBy: { createdAt: "desc" },
    include: {
      photo: {
        include: {
          seller: { select: { name: true } },
          category: { select: { name: true } },
          licenses: { select: { priceVnd: true, type: true } },
        },
      },
    },
  });

  return (
    <div>
      <PageHeader title="Danh sách yêu thích" subtitle={`${items.length} ảnh · nhận thông báo khi giảm giá`} />
      {items.length === 0 ? (
        <EmptyState
          title="Wishlist trống"
          hint="Nhấn ♥ trên ảnh bạn thích để lưu lại và theo dõi giá."
          action={<Link href="/" className="btn-primary mt-2">Khám phá ảnh</Link>}
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((it) => (
            <PhotoCard key={it.id} photo={it.photo} wishlisted showWishlist next="/wishlist" />
          ))}
        </div>
      )}
    </div>
  );
}
