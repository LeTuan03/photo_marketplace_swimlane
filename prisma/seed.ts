import { PrismaClient, type LicenseType, type Category } from "@prisma/client";
import sharp from "sharp";
import { hashPassword } from "../src/lib/password";
import { storage, keyFor } from "../src/lib/storage";
import { readMeta, makeWatermarkedPreview, makeThumb } from "../src/lib/image";
import { DEFAULT_CATEGORIES, DEFAULT_LICENSE_PRICE } from "../src/lib/constants";

const prisma = new PrismaClient();

/** Sinh một ảnh mẫu (gradient + nhãn) để có dữ liệu demo. */
async function sampleImage(title: string, c1: string, c2: string): Promise<Buffer> {
  const w = 1600;
  const h = 1100;
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <text x="50%" y="50%" font-family="Arial" font-size="64" font-weight="700"
          fill="rgba(255,255,255,0.92)" text-anchor="middle" dominant-baseline="middle">${title}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

async function createLivePhoto(opts: {
  sellerId: string;
  title: string;
  description: string;
  categoryId: string;
  tags: string[];
  colors: [string, string];
  licenses: Partial<Record<LicenseType, number>>;
}) {
  const original = await sampleImage(opts.title, opts.colors[0], opts.colors[1]);
  const meta = await readMeta(original);
  const preview = await makeWatermarkedPreview(original);
  const thumb = await makeThumb(original);

  const photo = await prisma.photo.create({
    data: {
      sellerId: opts.sellerId,
      title: opts.title,
      description: opts.description,
      categoryId: opts.categoryId,
      tags: opts.tags,
      status: "LIVE",
      reviewedAt: new Date(),
      hasModelRelease: true,
      allowSwap: true,
      width: meta.width,
      height: meta.height,
      sizeBytes: meta.sizeBytes,
      format: "jpeg",
      originalKey: "", // điền sau khi biết id
      previewKey: "",
      thumbKey: "",
      licenses: {
        create: Object.entries(opts.licenses).map(([type, priceVnd]) => ({
          type: type as LicenseType,
          priceVnd: priceVnd as number,
        })),
      },
    },
  });

  const oKey = keyFor.original(photo.id, "jpg");
  const pKey = keyFor.preview(photo.id);
  const tKey = keyFor.thumb(photo.id);
  await storage().put(oKey, original, "image/jpeg");
  await storage().put(pKey, preview, "image/webp");
  await storage().put(tKey, thumb, "image/webp");

  await prisma.photo.update({
    where: { id: photo.id },
    data: { originalKey: oKey, previewKey: pKey, thumbKey: tKey },
  });
  return photo;
}

async function main() {
  console.log("🌱 Seeding Picseo...");

  // --- Platform settings (AD1-AD5) ---
  await prisma.platformSetting.upsert({
    where: { key: "platform.name" },
    update: {},
    create: { key: "platform.name", value: "Picseo" },
  });

  // --- Coupon demo (B5) ---
  await prisma.coupon.upsert({
    where: { code: "WELCOME10" },
    update: {},
    create: { code: "WELCOME10", percentOff: 10, active: true },
  });

  // --- Categories (AD1) ---
  const categories: Category[] = [];
  for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
    const c = DEFAULT_CATEGORIES[i];
    const cat = await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, sortOrder: i },
      create: { slug: c.slug, name: c.name, sortOrder: i },
    });
    categories.push(cat);
  }
  const catBy = (slug: string) => categories.find((c) => c.slug === slug)!;

  // --- Users ---
  const pwd = await hashPassword("password123");
  const admin = await prisma.user.upsert({
    where: { email: "admin@picseo.local" },
    update: {},
    create: { email: "admin@picseo.local", name: "Quản trị viên", passwordHash: pwd, role: "ADMIN", kycStatus: "VERIFIED" },
  });
  const seller1 = await prisma.user.upsert({
    where: { email: "seller@picseo.local" },
    update: {},
    create: {
      email: "seller@picseo.local",
      name: "Minh Photographer",
      passwordHash: pwd,
      role: "SELLER",
      sellerTier: "PRO",
      kycStatus: "VERIFIED",
      payoutMethod: "BANK",
      payoutAccount: "Vietcombank • 0123456789",
    },
  });
  const seller2 = await prisma.user.upsert({
    where: { email: "seller2@picseo.local" },
    update: {},
    create: {
      email: "seller2@picseo.local",
      name: "Lan Studio",
      passwordHash: pwd,
      role: "SELLER",
      sellerTier: "NEW",
      kycStatus: "VERIFIED",
    },
  });
  await prisma.user.upsert({
    where: { email: "buyer@picseo.local" },
    update: {},
    create: { email: "buyer@picseo.local", name: "Người mua demo", passwordHash: pwd, role: "BUYER" },
  });

  // --- Sample photos ---
  const existing = await prisma.photo.count();
  if (existing === 0) {
    const dlp = DEFAULT_LICENSE_PRICE;
    await createLivePhoto({
      sellerId: seller1.id,
      title: "Hoàng hôn trên biển",
      description: "Khoảnh khắc hoàng hôn rực rỡ trên bờ biển miền Trung.",
      categoryId: catBy("phong-canh").id,
      tags: ["biển", "hoàng hôn", "phong cảnh", "cam"],
      colors: ["#f97316", "#7c2d12"],
      licenses: { PERSONAL: dlp.PERSONAL, COMMERCIAL: dlp.COMMERCIAL, EXTENDED: dlp.EXTENDED },
    });
    await createLivePhoto({
      sellerId: seller1.id,
      title: "Chân dung studio",
      description: "Chân dung nghệ thuật ánh sáng tối giản.",
      categoryId: catBy("chan-dung").id,
      tags: ["chân dung", "studio", "người"],
      colors: ["#1e3a5f", "#0f172a"],
      licenses: { PERSONAL: 80_000, COMMERCIAL: 250_000 },
    });
    await createLivePhoto({
      sellerId: seller2.id,
      title: "Kiến trúc đô thị",
      description: "Đường nét hiện đại của tòa nhà chọc trời.",
      categoryId: catBy("kien-truc").id,
      tags: ["kiến trúc", "thành phố", "hiện đại"],
      colors: ["#334155", "#0ea5e9"],
      licenses: { PERSONAL: dlp.PERSONAL, COMMERCIAL: dlp.COMMERCIAL },
    });
    await createLivePhoto({
      sellerId: seller2.id,
      title: "Núi rừng sương sớm",
      description: "Sương giăng trên những ngọn đồi xanh mướt.",
      categoryId: catBy("thien-nhien").id,
      tags: ["núi", "thiên nhiên", "sương"],
      colors: ["#064e3b", "#10b981"],
      licenses: { PERSONAL: dlp.PERSONAL, COMMERCIAL: dlp.COMMERCIAL, EDITORIAL: dlp.EDITORIAL },
    });
    await createLivePhoto({
      sellerId: seller1.id,
      title: "Ẩm thực Việt",
      description: "Tô phở nóng hổi đậm đà hương vị truyền thống.",
      categoryId: catBy("am-thuc").id,
      tags: ["ẩm thực", "phở", "việt nam"],
      colors: ["#b91c1c", "#f59e0b"],
      licenses: { COMMERCIAL: 200_000, EXTENDED: 600_000 },
    });
    console.log("  ✔ Đã tạo 5 ảnh mẫu LIVE");
  }

  // một ảnh PENDING để admin duyệt thử
  const pending = await prisma.photo.findFirst({ where: { status: "PENDING" } });
  if (!pending) {
    const original = await sampleImage("Đồ họa Vector", "#7c3aed", "#db2777");
    const meta = await readMeta(original);
    const preview = await makeWatermarkedPreview(original);
    const thumb = await makeThumb(original);
    const photo = await prisma.photo.create({
      data: {
        sellerId: seller2.id,
        title: "Đồ họa vector trừu tượng",
        description: "Mẫu vector chờ duyệt — dùng để thử luồng kiểm duyệt admin.",
        categoryId: catBy("vector").id,
        tags: ["vector", "đồ họa"],
        status: "PENDING",
        width: meta.width,
        height: meta.height,
        sizeBytes: meta.sizeBytes,
        originalKey: "",
        previewKey: "",
        thumbKey: "",
        licenses: { create: [{ type: "COMMERCIAL", priceVnd: 180_000 }] },
      },
    });
    await storage().put(keyFor.original(photo.id, "jpg"), original, "image/jpeg");
    await storage().put(keyFor.preview(photo.id), preview, "image/webp");
    await storage().put(keyFor.thumb(photo.id), thumb, "image/webp");
    await prisma.photo.update({
      where: { id: photo.id },
      data: {
        originalKey: keyFor.original(photo.id, "jpg"),
        previewKey: keyFor.preview(photo.id),
        thumbKey: keyFor.thumb(photo.id),
      },
    });
    console.log("  ✔ Đã tạo 1 ảnh PENDING chờ duyệt");
  }

  console.log("✅ Seed hoàn tất.");
  console.log("   Tài khoản demo (mật khẩu: password123):");
  console.log("   • admin@picseo.local  (Admin)");
  console.log("   • seller@picseo.local (Người bán - Pro)");
  console.log("   • buyer@picseo.local  (Người mua)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
