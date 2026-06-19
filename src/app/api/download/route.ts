import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyDownloadToken } from "@/lib/download";
import { storage } from "@/lib/storage";
import { resizeForDelivery } from "@/lib/image";

/**
 * Phát file gốc cho người mua. Đầu vào: ?token=<JWT 24h chứa grantId>.
 * Kiểm soát: token còn hạn + downloadCount < maxDownloads.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const grantId = await verifyDownloadToken(token);
  if (!grantId) return new NextResponse("Link tải không hợp lệ hoặc đã hết hạn (24h).", { status: 403 });

  const grant = await prisma.downloadGrant.findUnique({
    where: { id: grantId },
    include: { photo: true },
  });
  if (!grant) return new NextResponse("Không tìm thấy quyền tải.", { status: 404 });

  if (grant.downloadCount >= grant.maxDownloads) {
    return new NextResponse("Đã vượt quá số lần tải cho phép.", { status: 403 });
  }

  let buffer: Buffer;
  try {
    const original = await storage().getBuffer(grant.photo.originalKey);
    buffer = await resizeForDelivery(original, grant.sizeLabel);
  } catch {
    return new NextResponse("Không thể truy xuất file.", { status: 500 });
  }

  await prisma.downloadGrant.update({
    where: { id: grant.id },
    data: { downloadCount: { increment: 1 } },
  });

  const ext = grant.photo.format === "png" ? "png" : "jpg";
  const safeName = grant.photo.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "picseo";
  const filename = `${safeName}-${grant.sizeLabel}.${ext}`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": grant.photo.format === "png" ? "image/png" : "image/jpeg",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
