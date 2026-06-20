"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ReactNode } from "react";

export type DownloadResult = { url?: string; error?: string };

type DownloadAction = (
  prev: DownloadResult | null,
  formData: FormData,
) => Promise<DownloadResult>;

/**
 * Nút tải dùng server action TRẢ VỀ url (không redirect sang /api/download).
 *
 * Vì sao không redirect: /api/download trả file đính kèm (Content-Disposition:
 * attachment) -> trình duyệt TẢI file chứ không điều hướng trang, nên transition
 * của form không bao giờ "hoàn tất" và nút kẹt mãi ở trạng thái "Đang xử lý...".
 * Ở đây action trả url, client tự kích hoạt tải qua thẻ <a> ẩn -> trang đứng yên,
 * isPending tự thoát khi action trả kết quả.
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
  const [state, formAction, isPending] = useActionState(action, null);
  const firedFor = useRef<string | null>(null);

  useEffect(() => {
    const url = state?.url;
    if (!url || firedFor.current === url) return; // chống bắn 2 lần (StrictMode)
    firedFor.current = url;
    const a = document.createElement("a");
    a.href = url; // KHÔNG đặt download attr để dùng filename* từ header server
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [state]);

  return (
    <form action={formAction}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button type="submit" className={className} disabled={isPending}>
        {isPending ? pendingText : children}
      </button>
      {state?.error && <p className="mt-1 text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
