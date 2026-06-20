"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { signDownloadToken } from "@/lib/download";

/** Sinh link tải mới (24h) cho một quyền tải mà người dùng sở hữu (B6/B11). */
export async function requestDownloadAction(formData: FormData) {
  const user = await requireUser();
  const grantId = String(formData.get("grantId") ?? "");

  const grant = await prisma.downloadGrant.findUnique({ where: { id: grantId } });
  if (!grant || grant.buyerId !== user.id) redirect("/library?error=Không có quyền tải");
  if (grant!.downloadCount >= grant!.maxDownloads) {
    redirect("/library?error=Đã hết lượt tải cho ảnh này");
  }

  const token = await signDownloadToken(grant!.id, user.id);
  redirect(`/api/download?token=${encodeURIComponent(token)}`);
}
