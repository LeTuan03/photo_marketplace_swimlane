import "server-only";
import { env } from "./env";

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

function decodeIdToken(idToken: string): GoogleProfile {
  // id_token đến trực tiếp từ endpoint token của Google qua TLS -> tin cậy payload.
  const payloadB64 = idToken.split(".")[1];
  const json = Buffer.from(payloadB64, "base64").toString("utf-8");
  const p = JSON.parse(json) as {
    sub: string;
    email: string;
    email_verified?: boolean | string;
    name?: string;
    picture?: string;
  };
  return {
    sub: p.sub,
    email: p.email,
    emailVerified: p.email_verified === true || p.email_verified === "true",
    name: p.name || p.email,
    picture: p.picture,
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
  return decodeIdToken(data.id_token);
}
