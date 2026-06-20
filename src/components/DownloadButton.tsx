"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

export type DownloadResult = { url?: string; error?: string };

type DownloadAction = (formData: FormData) => Promise<DownloadResult>;

/** Lấy tên file từ header Content-Disposition (ưu tiên filename* UTF-8). */
function filenameFrom(cd: string | null): string {
  if (!cd) return "picseo";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  if (star) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      /* rơi xuống filename thường */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(cd);
  return plain ? plain[1] : "picseo";
}

/**
 * Nút tải: server action TRẢ VỀ url, client tự FETCH rồi lưu file qua blob.
 *
 * Vì sao không redirect / không điều hướng <a> tới /api/download:
 *  - /api/download trả file đính kèm -> nếu redirect, trình duyệt tải file nhưng
 *    transition của form không "hoàn tất" -> nút kẹt mãi ở "Đang xử lý...".
 *  - Nếu điều hướng <a> mà server trả LỖI (403/500 dạng text) thì cả trang bị thay
 *    bằng đoạn text lỗi thô.
 * Dùng fetch: tải xong thì lưu blob (trang đứng yên), lỗi thì đọc text hiện inline.
 */
export function DownloadButton({
  action,
  fields,
  className = "btn-primary",
  pendingText = "Đang xử lý...",
  children,
}: {
  action: DownloadAction;
  fields: Record<string, string>;
  className?: string;
  pendingText?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onClick() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) fd.append(k, v);

      const result = await action(fd);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (!result.url) return;

      const res = await fetch(result.url);
      if (!res.ok) {
        // Server trả lỗi (vd hết lượt) -> hiện inline, KHÔNG rời trang.
        setError((await res.text()) || "Không tải được file.");
        return;
      }
      const blob = await res.blob();
      const name = filenameFrom(res.headers.get("Content-Disposition"));
      const obj = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = obj;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(obj);

      // Tải xong: làm mới RSC để cập nhật số "còn N lượt" (quota đã trừ ở server)
      // mà không cần F5. Tải lại cùng ảnh không trừ quota nên số có thể giữ nguyên.
      router.refresh();
    });
  }

  return (
    <div>
      <button type="button" onClick={onClick} disabled={pending} className={className}>
        {pending ? pendingText : children}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
