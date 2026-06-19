import Link from "next/link";
import { Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PhotoCard } from "@/components/PhotoCard";
import { EmptyState } from "@/components/ui";
import { LICENSE_LABELS, LICENSE_ORDER } from "@/lib/constants";
import type { Prisma, LicenseType } from "@prisma/client";

export const dynamic = "force-dynamic";

type SP = { q?: string; cat?: string; license?: string; sort?: string };

export default async function HomePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const cat = sp.cat ?? "";
  const license = (sp.license ?? "") as LicenseType | "";
  const sort = sp.sort ?? "newest";

  const where: Prisma.PhotoWhereInput = { status: "LIVE" };
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { tags: { has: q.toLowerCase() } },
    ];
  }
  if (cat) where.category = { slug: cat };
  if (license) where.licenses = { some: { type: license } };

  const orderBy: Prisma.PhotoOrderByWithRelationInput =
    sort === "popular" ? { salesCount: "desc" } : { createdAt: "desc" };

  const [photos, categories] = await Promise.all([
    prisma.photo.findMany({
      where,
      orderBy,
      take: 60,
      include: {
        seller: { select: { name: true } },
        category: { select: { name: true } },
        licenses: { select: { priceVnd: true, type: true } },
      },
    }),
    prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  // sắp theo giá nếu cần (giá nhỏ nhất của ảnh)
  let list = photos;
  if (sort === "price_asc" || sort === "price_desc") {
    list = [...photos].sort((a, b) => {
      const pa = a.licenses.length ? Math.min(...a.licenses.map((l) => l.priceVnd)) : 0;
      const pb = b.licenses.length ? Math.min(...b.licenses.map((l) => l.priceVnd)) : 0;
      return sort === "price_asc" ? pa - pb : pb - pa;
    });
  }

  return (
    <div>
      <section className="mb-6 rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 p-8 text-white">
        <h1 className="text-3xl font-bold">Kho ảnh bản quyền cho mọi dự án</h1>
        <p className="mt-2 max-w-xl text-brand-100">
          Mua, bán và trao đổi ảnh an toàn với thanh toán qua escrow. Tải file gốc kèm certificate license.
        </p>
        <form action="/" className="mt-5 flex max-w-xl gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Tìm theo từ khóa, chủ đề, tag..."
              className="w-full rounded-lg border-0 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-900 outline-none"
            />
          </div>
          <button className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50">
            Tìm
          </button>
        </form>
      </section>

      {/* Bộ lọc */}
      <form action="/" className="mb-5 flex flex-wrap items-center gap-2">
        <input type="hidden" name="q" value={q} />
        <select name="cat" defaultValue={cat} className="input max-w-[180px]">
          <option value="">Tất cả danh mục</option>
          {categories.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="license" defaultValue={license} className="input max-w-[180px]">
          <option value="">Mọi license</option>
          {LICENSE_ORDER.map((t) => (
            <option key={t} value={t}>
              {LICENSE_LABELS[t]}
            </option>
          ))}
        </select>
        <select name="sort" defaultValue={sort} className="input max-w-[160px]">
          <option value="newest">Mới nhất</option>
          <option value="popular">Bán chạy</option>
          <option value="price_asc">Giá tăng dần</option>
          <option value="price_desc">Giá giảm dần</option>
        </select>
        <button className="btn-outline">Lọc</button>
        {(q || cat || license) && (
          <Link href="/" className="text-sm text-gray-500 hover:underline">
            Xóa lọc
          </Link>
        )}
      </form>

      <p className="mb-3 text-sm text-gray-500">{list.length} ảnh</p>

      {list.length === 0 ? (
        <EmptyState title="Không tìm thấy ảnh phù hợp" hint="Thử từ khóa khác hoặc xóa bộ lọc." />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((p) => (
            <PhotoCard key={p.id} photo={p} />
          ))}
        </div>
      )}
    </div>
  );
}
