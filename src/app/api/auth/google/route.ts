import { type NextRequest, NextResponse } from "next/server";
import { googleConfigured, getAuthUrl } from "@/lib/google";
import { randomToken } from "@/lib/utils";
import { env } from "@/lib/env";

/** Bắt đầu đăng nhập Google: tạo state (CSRF) + chuyển tới trang đồng ý. */
export async function GET(req: NextRequest) {
  if (!googleConfigured()) {
    return NextResponse.redirect(`${env.appUrl}/login?error=${encodeURIComponent("Chưa cấu hình đăng nhập Google")}`);
  }
  const nextParam = req.nextUrl.searchParams.get("next") || "/";
  const next = nextParam.startsWith("/") ? nextParam : "/";
  const state = randomToken(16);

  const res = NextResponse.redirect(getAuthUrl(state));
  const opts = { httpOnly: true, secure: env.isProd, sameSite: "lax" as const, path: "/", maxAge: 600 };
  res.cookies.set("g_oauth_state", state, opts);
  res.cookies.set("g_oauth_next", next, opts);
  return res;
}
