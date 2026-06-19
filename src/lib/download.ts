import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

const secret = new TextEncoder().encode(env.downloadSecret);

/**
 * Link tải = JWT ngắn hạn (mặc định 24h) chứa grantId.
 * Việc giới hạn "tối đa 3 lần tải" được kiểm soát bằng downloadCount trong DB.
 */
export async function signDownloadToken(grantId: string): Promise<string> {
  return new SignJWT({ g: grantId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${env.rules.downloadLinkHours}h`)
    .sign(secret);
}

export async function verifyDownloadToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return String(payload.g);
  } catch {
    return null;
  }
}
