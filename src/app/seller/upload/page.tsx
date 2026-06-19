import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { uploadPhotoAction } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader, Alert } from "@/components/ui";
import { LICENSE_ORDER, LICENSE_LABELS, DEFAULT_LICENSE_PRICE } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireRole("SELLER", "ADMIN");
  const sp = await searchParams;
  const categories = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });

  return (
    <div>
      <PageHeader title="Đăng ảnh mới" subtitle="Ảnh sẽ vào hàng chờ duyệt trước khi lên marketplace." />
      {sp.error && <div className="mb-4"><Alert kind="error">{decodeURIComponent(sp.error)}</Alert></div>}

      <form action={uploadPhotoAction} className="grid gap-6 lg:grid-cols-2">
        <div className="card space-y-4 p-5">
          <div>
            <label className="label">File ảnh (JPG/PNG/WEBP, tối đa 50MB)</label>
            <input name="file" type="file" accept="image/jpeg,image/png,image/webp" required className="input" />
          </div>
          <div>
            <label className="label">Tiêu đề *</label>
            <input name="title" required minLength={3} className="input" placeholder="VD: Hoàng hôn trên biển" />
          </div>
          <div>
            <label className="label">Mô tả</label>
            <textarea name="description" rows={4} className="input" placeholder="Mô tả nội dung, bối cảnh chụp..." />
          </div>
          <div>
            <label className="label">Danh mục</label>
            <select name="categorySlug" className="input">
              <option value="">— Chọn danh mục —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Tags (phân tách bằng dấu phẩy)</label>
            <input name="tags" className="input" placeholder="biển, hoàng hôn, phong cảnh" />
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="hasModelRelease" /> Có model release (cho ảnh chân dung/người)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="allowSwap" /> Cho phép trao đổi (swap) ảnh này
            </label>
          </div>
        </div>

        <div className="card h-fit space-y-4 p-5">
          <div>
            <h2 className="font-semibold text-gray-900">Loại bán & giá (VND)</h2>
            <p className="text-xs text-gray-500">Bật ít nhất 1 license và đặt giá lớn hơn 0.</p>
          </div>
          {LICENSE_ORDER.map((type) => (
            <div key={type} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
                <input type="checkbox" name={`on_${type}`} defaultChecked={type === "PERSONAL" || type === "COMMERCIAL"} />
                {LICENSE_LABELS[type]}
              </label>
              <input
                name={`price_${type}`}
                type="number"
                min={0}
                step={1000}
                defaultValue={DEFAULT_LICENSE_PRICE[type]}
                className="input max-w-[140px] text-right"
              />
            </div>
          ))}
          <SubmitButton className="btn-primary w-full" pendingText="Đang tải lên & xử lý...">
            Tải lên & gửi duyệt
          </SubmitButton>
          <p className="text-xs text-gray-400">
            Hệ thống tự tạo bản preview có watermark; file gốc được giữ an toàn trong vault và chỉ phát cho người mua hợp lệ.
          </p>
        </div>
      </form>
    </div>
  );
}
