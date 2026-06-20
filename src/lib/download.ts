import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

const secret = new TextEncoder().encode(env.downloadSecret);

/**
 * Link tải = JWT ngắn hạn (mặc định 24h) chứa grantId và GẮN VỚI user (sub).
 * Token không còn là "bearer" thuần — route tải phải khớp sub với phiên đăng nhập,
 * nên link lộ qua log/referer cũng không tải được nếu không phải chủ sở hữu.
 * Giới hạn "tối đa 3 lần tải" do downloadCount trong DB kiểm soát (nguyên tử).
 */
export async function signDownloadToken(grantId: string, userId: string): Promise<string> {
  return new SignJWT({ g: grantId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${env.rules.downloadLinkHours}h`)
    .sign(secret);
}

export type DownloadTokenPayload = { grantId: string; userId: string };

export async function verifyDownloadToken(token: string): Promise<DownloadTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    if (!payload.sub || !payload.g) return null;
    return { grantId: String(payload.g), userId: String(payload.sub) };
  } catch {
    return null;
  }
}
