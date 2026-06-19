import Link from "next/link";
import { publicAssetUrl } from "@/lib/storage";
import { formatVnd } from "@/lib/money";
import { ImageOff } from "lucide-react";

export type PhotoCardData = {
  id: string;
  title: string;
  thumbKey: string;
  seller: { name: string };
  licenses: { priceVnd: number }[];
  category?: { name: string } | null;
};

export function PhotoCard({ photo }: { photo: PhotoCardData }) {
  const minPrice = photo.licenses.length
    ? Math.min(...photo.licenses.map((l) => l.priceVnd))
    : null;

  return (
    <Link href={`/photos/${photo.id}`} className="group card overflow-hidden transition hover:shadow-md">
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
        <p className="mt-2 text-sm font-semibold text-brand-700">
          {minPrice !== null ? `từ ${formatVnd(minPrice)}` : "Liên hệ"}
        </p>
      </div>
    </Link>
  );
}
