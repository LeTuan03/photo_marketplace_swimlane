import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "./env";

// Bộ khoá công khai của Google để verify CHỮ KÝ id_token (RS256). Cache nội bộ.
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

/**
 * Google OAuth 2.0 — luồng authorization code cho web server (có client secret).
 * Không phụ thuộc NextAuth, dùng chung phiên jose hiện có.
 */

export function googleConfigured(): boolean {
  return Boolean(env.google.clientId && env.google.clientSecret);
}

export function redirectUri(): string {
  return `${env.appUrl}/api/auth/google/callback`;
}

/** URL trang đồng ý của Google. */
export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.google.clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
};

async function verifyIdToken(idToken: string): Promise<GoogleProfile> {
  // Verify CHỮ KÝ + iss + aud thay vì chỉ base64-decode. Trước đây id_token được
  // tin tưởng "vì đến từ Google qua TLS" — nhưng không kiểm tra aud nên token cấp
  // cho một OAuth client khác cũng được chấp nhận (confused-deputy). Nay bắt buộc:
  //  - chữ ký khớp khoá công khai Google (RS256),
  //  - iss = accounts.google.com,
  //  - aud = chính client_id của ứng dụng,
  //  - còn hạn (exp) — do jwtVerify tự kiểm tra.
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: env.google.clientId,
    algorithms: ["RS256"],
  });
  const ev = payload.email_verified;
  return {
    sub: String(payload.sub),
    email: String(payload.email ?? ""),
    emailVerified: ev === true || ev === "true",
    name: (typeof payload.name === "string" && payload.name) || String(payload.email ?? ""),
    picture: typeof payload.picture === "string" ? payload.picture : undefined,
  };
}

/** Đổi authorization code lấy thông tin người dùng. */
export async function exchangeCode(code: string): Promise<GoogleProfile> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.google.clientId,
      client_secret: env.google.clientSecret,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status}`);
  }
  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) throw new Error("Google không trả về id_token");
  return verifyIdToken(data.id_token);
}
