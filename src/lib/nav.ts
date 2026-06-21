import { redirect } from "next/navigation";

/**
 * Chuyển hướng kèm thông báo qua `?error=...`, TỰ encode phần message.
 *
 * Vì sao bắt buộc: Next set THẲNG url vào header `Location` (redirect lúc render)
 * và `x-action-redirect` (redirect trong Server Action) — `action-handler.js`
 * gọi `res.setHeader(..., redirectUrl)` mà KHÔNG encode. Header là ByteString
 * (0–255); ký tự tiếng Việt (vd "ầ" = U+1EA7 = 7847) làm `setHeader` ném lỗi ->
 * Server Action trả phản hồi hỏng -> client báo "An unexpected response was
 * received from the server" (và redirect lúc render thì 500). Trang đọc lại
 * bằng `decodeURIComponent(sp.error)` như hiện tại.
 *
 * Quy ước: `error=` là tham số CUỐI của url (đúng với mọi call site hiện tại),
 * nên encode toàn bộ phần phía sau nó là an toàn.
 */
export function redirectError(url: string): never {
  const marker = "error=";
  const at = url.indexOf(marker);
  if (at === -1) redirect(url);
  const head = url.slice(0, at + marker.length);
  const message = url.slice(at + marker.length);
  redirect(head + encodeURIComponent(message));
}
