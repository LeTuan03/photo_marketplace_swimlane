// Đặt lại downloadCount = 0 cho các grant bị "đốt" lượt do lỗi 500 trước đây
// (bug header ByteString làm response ném lỗi SAU khi đã trừ lượt, không hoàn lại
// -> mỗi lần 500 lại mất 1 lượt cho tới khi cháy sạch quota của grant).
//
// Dùng:
//   node scripts/reset-download-quota.mjs            -> reset MỌI grant của user test
//   node scripts/reset-download-quota.mjs <id> [id]  -> chỉ reset các grant chỉ định
//
// Yêu cầu: Postgres đang chạy. Script tự đọc DATABASE_URL từ .env.
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

function dbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const m = env.match(/^\s*DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
  if (!m) throw new Error("Không tìm thấy DATABASE_URL trong .env");
  return m[1];
}

const SES = "cmqlyv6nu000am0h5bixzwflc"; // user letuan trong phiên đang test
const ids = process.argv.slice(2);

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } });
try {
  // Lấy danh sách grant cần reset: theo id chỉ định, hoặc toàn bộ grant của user test.
  const where = ids.length ? { id: { in: ids } } : { buyerId: SES };
  const grants = await prisma.downloadGrant.findMany({
    where,
    select: { id: true, downloadCount: true, maxDownloads: true },
  });
  if (!grants.length) {
    console.log("Không có grant nào khớp.");
  }
  for (const g of grants) {
    if (g.downloadCount === 0) {
      console.log(`- ${g.id}: đã là 0/${g.maxDownloads} (bỏ qua)`);
      continue;
    }
    await prisma.downloadGrant.update({ where: { id: g.id }, data: { downloadCount: 0 } });
    console.log(`- ${g.id}: ${g.downloadCount}/${g.maxDownloads} -> 0/${g.maxDownloads} (đã reset)`);
  }
} finally {
  await prisma.$disconnect();
}
