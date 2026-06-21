"use server";

import { redirect } from "next/navigation";
import { redirectError } from "@/lib/nav";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { notifyAdmins } from "@/lib/notifications";
import { normalizeCertNo } from "@/lib/utils";

/**
 * Báo cáo một ảnh đang bị DÙNG SAI PHẠM VI license ở bên ngoài (vd: giữ license "Cá nhân"
 * nhưng đem chạy quảng cáo thương mại). Gắn vào đúng grant qua certNo nếu tra ra được.
 * Cần đăng nhập để chống spam. Admin xử lý ở /admin/misuse.
 */
export async function reportMisuseAction(formData: FormData) {
  const certNo = normalizeCertNo(String(formData.get("certNo") ?? ""));
  const photoIdInput = String(formData.get("photoId") ?? "");
  const usageUrl = String(formData.get("usageUrl") ?? "").trim().slice(0, 500);
  const detail = String(formData.get("detail") ?? "").slice(0, 1000);
  const backTo = certNo ? `/verify?cert=${encodeURIComponent(certNo)}` : "/verify";
  const sep = certNo ? "&" : "?";

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(backTo)}`);

  if (!/^https?:\/\//i.test(usageUrl)) {
    redirectError(`${backTo}${sep}error=Vui lòng nhập link (http/https) nơi ảnh đang bị dùng sai phạm vi`);
  }

  // Tra grant theo certNo để gắn đúng giấy phép + ảnh (không bắt buộc tra ra).
  const grant = certNo
    ? await prisma.downloadGrant.findUnique({ where: { certNo }, select: { id: true, photoId: true } })
    : null;
  const photoId = grant?.photoId ?? photoIdInput;
  if (!photoId) redirectError(`${backTo}${sep}error=Không xác định được ảnh để báo cáo`);

  // Một người chỉ giữ một báo cáo OPEN cho cùng cert/ảnh (chống bấm trùng / spam).
  const dup = await prisma.misuseReport.findFirst({
    where: { reporterId: user!.id, photoId, certNo: certNo || null, status: "OPEN" },
    select: { id: true },
  });
  if (!dup) {
    await prisma.misuseReport.create({
      data: {
        photoId,
        grantId: grant?.id ?? null,
        certNo: certNo || null,
        reporterId: user!.id,
        usageUrl,
        detail,
      },
    });
    await notifyAdmins(
      "Báo cáo dùng sai phạm vi license",
      `Cert: ${certNo || "(không có)"} · Nơi dùng: ${usageUrl}`,
      "/admin/misuse",
    );
  }
  redirect(`${backTo}${sep}reported=1`);
}
