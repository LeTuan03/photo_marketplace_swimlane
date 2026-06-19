import { type NextRequest, NextResponse } from "next/server";
import { storage } from "@/lib/storage";

// Chỉ phục vụ preview & thumbnail (công khai). File gốc KHÔNG bao giờ phát ở đây.
const ALLOWED_PREFIXES = ["previews/", "thumbs/"];

export async function GET(_req: NextRequest, ctx: { params: Promise<{ key: string[] }> }) {
  const { key } = await ctx.params;
  const objectKey = key.join("/");

  if (!ALLOWED_PREFIXES.some((p) => objectKey.startsWith(p))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    const buf = await storage().getBuffer(objectKey);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
