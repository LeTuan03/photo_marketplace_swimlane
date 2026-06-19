import Link from "next/link";
import { publicAssetUrl } from "@/lib/storage";
import { formatVnd } from "@/lib/money";
import { ImageOff, Heart } from "lucide-react";
import { Stars } from "@/components/Stars";
import { toggleWishlistAction } from "@/app/wishlist/actions";

export type PhotoCardData = {
  id: string;
  title: string;
  thumbKey: string;
  seller: { name: string };
  licenses: { priceVnd: number }[];
  category?: { name: string } | null;
  ratingSum?: number;
  ratingCount?: number;
};

export function PhotoCard({
  photo,
  wishlisted = false,
  showWishlist = false,
  next = "/",
}: {
  photo: PhotoCardData;
  wishlisted?: boolean;
  showWishlist?: boolean;
  next?: string;
}) {
  const minPrice = photo.licenses.length ? Math.min(...photo.licenses.map((l) => l.priceVnd)) : null;
  const avg = (photo.ratingCount ?? 0) > 0 ? (photo.ratingSum ?? 0) / (photo.ratingCount ?? 1) : 0;

  return (
    <div className="group relative">
      <Link href={`/photos/${photo.id}`} className="card block overflow-hidden transition hover:shadow-md">
        <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
          {photo.thumbKey ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={publicAssetUrl(photo.thumbKey)}
              alt={photo.title}
              className="h-full w-full object-cover transition group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-gray-300">
              <ImageOff className="h-8 w-8" />
            </div>
          )}
          {photo.category && (
            <span className="absolute left-2 top-2 badge bg-black/60 text-white">{photo.category.name}</span>
          )}
        </div>
        <div className="p-3">
          <p className="truncate font-medium text-gray-900">{photo.title}</p>
          <p className="mt-0.5 truncate text-xs text-gray-500">bởi {photo.seller.name}</p>
          <div className="mt-1.5 flex items-center justify-between">
            <p className="text-sm font-semibold text-brand-700">
              {minPrice !== null ? `từ ${formatVnd(minPrice)}` : "Liên hệ"}
            </p>
            {(photo.ratingCount ?? 0) > 0 && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Stars value={avg} size={12} />
                {avg.toFixed(1)}
              </span>
            )}
          </div>
        </div>
      </Link>

      {showWishlist && (
        <form action={toggleWishlistAction} className="absolute right-2 top-2">
          <input type="hidden" name="photoId" value={photo.id} />
          <input type="hidden" name="next" value={next} />
          <button
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow hover:bg-white"
            title={wishlisted ? "Bỏ khỏi yêu thích" : "Thêm vào yêu thích"}
            aria-label="Yêu thích"
          >
            <Heart className={`h-4 w-4 ${wishlisted ? "fill-red-500 text-red-500" : "text-gray-500"}`} />
          </button>
        </form>
      )}
    </div>
  );
}
