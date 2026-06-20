// Liệt kê toàn bộ download grant của user đang đăng nhập để soi count/max thực tế.
// Dùng:  node scripts/inspect-grants.mjs
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
const TARGET = "cmqmes6tf00028qhc03zbgo79"; // grant đang bấm tải (mới nhất)

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } });
try {
  const all = await prisma.downloadGrant.findMany({
    where: { buyerId: SES },
    orderBy: { createdAt: "desc" },
    include: { photo: { select: { title: true, status: true, originalKey: true } } },
  });
  console.log(`\n== ${all.length} grant của user ${SES} ==`);
  for (const g of all) {
    const mark = g.id === TARGET ? "  <<< ĐANG TẢI" : "";
    console.log(
      `- ${g.id} | ${g.downloadCount}/${g.maxDownloads} | size=${g.sizeLabel} | ${g.source} | photo="${g.photo?.title}" status=${g.photo?.status} key=${g.photo?.originalKey}${mark}`,
    );
  }
  const t = all.find((g) => g.id === TARGET);
  console.log(
    `\n== TARGET ${TARGET} ==\n`,
    t ? `count/max = ${t.downloadCount}/${t.maxDownloads} -> ${t.downloadCount >= t.maxDownloads ? "ĐÃ HẾT (server trả 403)" : "còn lượt"}` : "KHÔNG TÌM THẤY",
  );
} finally {
  await prisma.$disconnect();
}
