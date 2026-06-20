// Đặt lại downloadCount = 0 cho các grant bị "đốt" lượt do lỗi 500 trước đây
// (bug header ByteString làm response ném lỗi SAU khi đã trừ lượt, không hoàn lại).
//
// Dùng:  node scripts/reset-download-quota.mjs [grantId ...]
// Không truyền id -> đặt lại 2 grant đã biết bị ảnh hưởng trong lúc test.
//
// Yêu cầu: Postgres đang chạy. Script tự đọc DATABASE_URL từ .env.
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

// Đọc DATABASE_URL từ .env vì chạy `node` thuần không tự nạp .env.
function dbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const m = env.match(/^\s*DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
  if (!m) throw new Error("Không tìm thấy DATABASE_URL trong .env");
  return m[1];
}

const DEFAULT_IDS = ["cmqmdvge3000eplhlb2qm1hdg", "cmqmbgi05000c5vngflw06ro1"];
const ids = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_IDS;

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } });
try {
  for (const id of ids) {
    const g = await prisma.downloadGrant.findUnique({ where: { id } });
    if (!g) {
      console.log(`- ${id}: KHÔNG TÌM THẤY (bỏ qua)`);
      continue;
    }
    await prisma.downloadGrant.update({ where: { id }, data: { downloadCount: 0 } });
    console.log(`- ${id}: ${g.downloadCount}/${g.maxDownloads} -> 0/${g.maxDownloads} (đã reset)`);
  }
} finally {
  await prisma.$disconnect();
}
