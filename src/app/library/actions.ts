"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { signDownloadToken } from "@/lib/download";
import type { DownloadResult } from "@/components/DownloadButton";

/**
 * Sinh link tải mới (24h) cho một quyền tải mà người dùng sở hữu (B6/B11).
 * TRẢ url cho client tự kích hoạt tải (không redirect) để nút không kẹt pending —
 * xem giải thích trong components/DownloadButton.tsx.
 */
export async function requestDownloadAction(
  _prev: DownloadResult | null,
  formData: FormData,
): Promise<DownloadResult> {
  const user = await requireUser();
  const grantId = String(formData.get("grantId") ?? "");

  const grant = await prisma.downloadGrant.findUnique({ where: { id: grantId } });
  if (!grant || grant.buyerId !== user.id) return { error: "Không có quyền tải ảnh này." };
  if (grant.downloadCount >= grant.maxDownloads) {
    return { error: "Đã hết lượt tải cho ảnh này." };
  }

  const token = await signDownloadToken(grant.id, user.id);
  return { url: `/api/download?token=${encodeURIComponent(token)}` };
}
