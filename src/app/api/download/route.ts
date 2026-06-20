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

  // QUAN TRỌNG: mọi thao tác có thể lỗi SAU khi đã giành lượt (đọc storage, resize,
  // dựng filename, dựng response) đều nằm trong try/catch này. Trước đây phần dựng
  // response nằm NGOÀI try -> khi nó ném lỗi (vd tên file có ký tự > 255) thì lượt
  // tải đã bị trừ mà không hoàn lại -> mỗi lần 500 lại "đốt" 1 lượt, hết sạch quota.
  try {
    const original = await storage().getBuffer(grant.photo.originalKey);
    const buffer = await resizeForDelivery(original, grant.sizeLabel);

    // ext/MIME phải khớp ĐÚNG định dạng gốc. resizeForDelivery giữ nguyên định dạng
    // đầu vào (không ép encode), nên ảnh webp tải về phải gắn .webp + image/webp —
    // trước đây mọi định dạng != png đều bị gán .jpg/image/jpeg -> file webp hỏng.
    const fmt = grant.photo.format;
    const ext = fmt === "png" ? "png" : fmt === "webp" ? "webp" : "jpg";
    const mime = fmt === "png" ? "image/png" : fmt === "webp" ? "image/webp" : "image/jpeg";
    // Tên đẹp giữ nguyên chữ Unicode (tiếng Việt) — dùng cho filename* (RFC 5987).
    const prettyName = grant.photo.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "picseo";
    // Header HTTP chỉ nhận ByteString (Latin-1, 0-255). Ký tự > 255 (vd "Ỉ"=7848) sẽ
    // ném lỗi khi dựng response -> phần filename= dự phòng phải rút về ASCII thuần.
    const asciiName =
      prettyName
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "") // bỏ dấu thanh/dấu phụ sau khi tách
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "picseo";
    const filename = `${prettyName}-${grant.sizeLabel}.${ext}`;
    const asciiFilename = `${asciiName}-${grant.sizeLabel}.${ext}`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mime,
        // filename= cho client cũ (ASCII), filename*= cho UTF-8 (browser hiện đại ưu tiên).
        "Content-Disposition": `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    // Trả lại lượt đã giành nếu không phát được file vì bất kỳ lý do gì.
    await prisma.downloadGrant.update({
      where: { id: grant.id },
      data: { downloadCount: { decrement: 1 } },
    });
    return new NextResponse("Không thể truy xuất file.", { status: 500 });
  }
}
