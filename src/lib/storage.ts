import fs from "node:fs/promises";
import path from "node:path";
import { env } from "./env";

/**
 * Lớp trừu tượng lưu trữ: hỗ trợ "local" (ổ đĩa) và "s3" (S3 / MinIO).
 * Quy ước key:
 *   originals/<photoId>.<ext>  -> file gốc (vault, chỉ phát qua link tải có entitlement)
 *   previews/<photoId>.webp    -> bản preview có watermark (phát công khai)
 *   thumbs/<photoId>.webp      -> thumbnail (phát công khai)
 */
export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  getBuffer(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

// ----------------------------- LOCAL -----------------------------
class LocalStorage implements StorageDriver {
  private root: string;
  constructor(dir: string) {
    this.root = path.resolve(process.cwd(), dir);
  }
  private full(key: string) {
    // chặn path traversal
    const safe = key.replace(/\\/g, "/").replace(/\.\.+/g, "");
    return path.join(this.root, safe);
  }
  async put(key: string, body: Buffer, _contentType: string): Promise<void> {
    const fp = this.full(key);
    await fs.mkdir(path.dirname(fp), { recursive: true });
    await fs.writeFile(fp, body);
  }
  async getBuffer(key: string): Promise<Buffer> {
    return fs.readFile(this.full(key));
  }
  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.full(key));
    } catch {
      /* file đã không tồn tại — bỏ qua */
    }
  }
}

// ------------------------------ S3 -------------------------------
class S3Storage implements StorageDriver {
  // import động để không bắt buộc cài SDK khi dùng local
  private clientPromise: Promise<any>;
  private bucket: string;

  constructor() {
    this.bucket = env.s3.bucket;
    this.clientPromise = import("@aws-sdk/client-s3").then(({ S3Client }) => {
      return new S3Client({
        region: env.s3.region,
        endpoint: env.s3.endpoint || undefined,
        forcePathStyle: env.s3.forcePathStyle,
        credentials: env.s3.accessKeyId
          ? {
              accessKeyId: env.s3.accessKeyId,
              secretAccessKey: env.s3.secretAccessKey,
            }
          : undefined,
      });
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const client = await this.clientPromise;
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async getBuffer(key: string): Promise<Buffer> {
    const client = await this.clientPromise;
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const res = await client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const bytes = await res.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async delete(key: string): Promise<void> {
    const client = await this.clientPromise;
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}

let _driver: StorageDriver | null = null;
export function storage(): StorageDriver {
  if (_driver) return _driver;
  _driver =
    env.storageDriver === "s3"
      ? new S3Storage()
      : new LocalStorage(env.localStorageDir);
  return _driver;
}

/** URL công khai để hiển thị preview/thumbnail (luôn đi qua app để kiểm soát). */
export function publicAssetUrl(key: string): string {
  return `/api/asset/${key}`;
}

/** Định dạng key cho từng loại derivative của một ảnh. */
export const keyFor = {
  original: (photoId: string, ext: string) => `originals/${photoId}.${ext}`,
  preview: (photoId: string) => `previews/${photoId}.webp`,
  thumb: (photoId: string) => `thumbs/${photoId}.webp`,
};
