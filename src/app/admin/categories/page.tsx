import { Trash2, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { createCategoryAction, updateCategoryAction, deleteCategoryAction } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader, Alert } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireRole("ADMIN");
  const sp = await searchParams;
  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { photos: true } } },
  });

  return (
    <div>
      <PageHeader title="Danh mục" subtitle="Quản lý taxonomy ảnh (AD1)." />
      {sp.error && <div className="mb-4"><Alert kind="error">{decodeURIComponent(sp.error)}</Alert></div>}

      <form action={createCategoryAction} className="card mb-5 flex items-end gap-2 p-4">
        <div className="flex-1">
          <label className="label">Thêm danh mục mới</label>
          <input name="name" required className="input" placeholder="VD: Du lịch" />
        </div>
        <SubmitButton className="btn-primary"><Plus className="h-4 w-4" /> Thêm</SubmitButton>
      </form>

      <div className="space-y-2">
        {categories.map((c) => (
          <div key={c.id} className="card flex items-center gap-3 p-3">
            <form action={updateCategoryAction} className="flex flex-1 items-center gap-2">
              <input type="hidden" name="id" value={c.id} />
              <input name="name" defaultValue={c.name} className="input max-w-xs" />
              <span className="text-xs text-gray-400">/{c.slug} · {c._count.photos} ảnh</span>
              <SubmitButton className="btn-outline px-3 py-1.5 text-xs">Lưu</SubmitButton>
            </form>
            <form action={deleteCategoryAction}>
              <input type="hidden" name="id" value={c.id} />
              <button className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Xóa">
                <Trash2 className="h-4 w-4" />
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
