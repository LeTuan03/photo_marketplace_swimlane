import sharp from "sharp";

export type ImageMeta = {
  width: number;
  height: number;
  format: string;
  sizeBytes: number;
};

const PREVIEW_MAX = 1280;
const THUMB_MAX = 480;

export async function readMeta(buffer: Buffer): Promise<ImageMeta> {
  const m = await sharp(buffer).metadata();
  return {
    width: m.width ?? 0,
    height: m.height ?? 0,
    format: m.format ?? "jpeg",
    sizeBytes: buffer.length,
  };
}

/** SVG watermark dạng tile chéo phủ kín ảnh preview. */
function watermarkSvg(width: number, height: number, text = "PICSEO • PREVIEW"): Buffer {
  const fontSize = Math.max(18, Math.round(width / 26));
  const step = fontSize * 9;
  const svg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="wm" width="${step}" height="${step}" patternUnits="userSpaceOnUse"
               patternTransform="rotate(-30)">
        <text x="0" y="${fontSize}" font-family="Arial, sans-serif" font-size="${fontSize}"
              font-weight="700" fill="rgba(255,255,255,0.28)">${text}</text>
        <text x="0" y="${fontSize}" font-family="Arial, sans-serif" font-size="${fontSize}"
              font-weight="700" fill="rgba(0,0,0,0.10)" transform="translate(1,1)">${text}</text>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#wm)"/>
  </svg>`;
  return Buffer.from(svg);
}

/** Tạo bản preview có watermark (webp). */
export async function makeWatermarkedPreview(buffer: Buffer): Promise<Buffer> {
  const base = sharp(buffer).rotate().resize({
    width: PREVIEW_MAX,
    height: PREVIEW_MAX,
    fit: "inside",
    withoutEnlargement: true,
  });
  const meta = await base.clone().metadata();
  const w = meta.width ?? PREVIEW_MAX;
  const h = meta.height ?? PREVIEW_MAX;
  return base
    .composite([{ input: watermarkSvg(w, h), gravity: "northwest" }])
    .webp({ quality: 78 })
    .toBuffer();
}

/** Thumbnail nhỏ có watermark nhẹ. */
export async function makeThumb(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize({ width: THUMB_MAX, height: THUMB_MAX, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 70 })
    .toBuffer();
}

/** Resize file gốc theo size người mua chọn (dùng khi tải về). */
export async function resizeForDelivery(buffer: Buffer, sizeLabel: string): Promise<Buffer> {
  const dims: Record<string, number> = { S: 800, M: 1600, L: 2400 };
  const target = dims[sizeLabel];
  if (!target) return buffer; // ORIGINAL -> nguyên gốc
  return sharp(buffer)
    .rotate()
    .resize({ width: target, height: target, fit: "inside", withoutEnlargement: true })
    .toBuffer();
}
