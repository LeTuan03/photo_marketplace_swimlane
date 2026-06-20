import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyDownloadToken } from "@/lib/download";
import { getCurrentUser } from "@/lib/auth";
import { storage } from "@/lib/storage";
import { resizeForDelivery } from "@/lib/image";

/**
 * Phát file gốc cho người mua. Đầu vào: ?token=<JWT 24h gắn grantId + user>.
 * Kiểm soát: phải đăng nhập + token khớp đúng chủ grant + ảnh chưa bị gỡ +
 * giành 1 lượt tải NGUYÊN TỬ (downloadCount < maxDownloads) trước khi phát.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Bạn cần đăng nhập để tải.", { status: 401 });

  const token = req.nextUrl.searchParams.get("token") ?? "";
  const payload = await verifyDownloadToken(token);
  if (!payload) return new NextResponse("Link tải không hợp lệ hoặc đã hết hạn (24h).", { status: 403 });

  const grant = await prisma.downloadGrant.findUnique({
    where: { id: payload.grantId },
    include: { photo: true },
  });
  if (!grant) return new NextResponse("Không tìm thấy quyền tải.", { status: 404 });

  // Quyền tải phải thuộc về chính người đang đăng nhập (token cũng phải cấp cho họ).
  if (grant.buyerId !== user.id || payload.userId !== user.id) {
    return new NextResponse("Bạn không có quyền tải file này.", { status: 403 });
  }
  // Ảnh đã bị gỡ (REMOVED) hoặc đang tạm giữ DMCA -> không phát file gốc.
  if (grant.photo.status === "REMOVED" || grant.photo.status === "DMCA_HOLD") {
    return new NextResponse("Ảnh đã bị gỡ hoặc đang bị khiếu nại.", { status: 410 });
  }

  // Giành 1 lượt tải NGUYÊN TỬ: chỉ tăng khi downloadCount < maxDownloads.
  // Bắn N request song song không còn vượt được giới hạn (trước đây check rồi mới
  // tăng ở 2 câu lệnh tách rời -> race tải vượt số lần).
  const claimed = await prisma.downloadGrant.updateMany({
    where: { id: grant.id, downloadCount: { lt: grant.maxDownloads } },
    data: { downloadCount: { increment: 1 } },
  });
  if (claimed.count === 0) {
    return new NextResponse("Đã vượt quá số lần tải cho phép.", { status: 403 });
  }

  let buffer: Buffer;
  try {
    const original = await storage().getBuffer(grant.photo.originalKey);
    buffer = await resizeForDelivery(original, grant.sizeLabel);
  } catch {
    // Trả lại lượt đã giành nếu không phát được file.
    await prisma.downloadGrant.update({
      where: { id: grant.id },
      data: { downloadCount: { decrement: 1 } },
    });
    return new NextResponse("Không thể truy xuất file.", { status: 500 });
  }

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
