import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exchangeCode } from "@/lib/google";
import { buildSessionCookie } from "@/lib/auth";
import { env } from "@/lib/env";

/** Google gọi lại sau khi người dùng đồng ý: đổi code -> hồ sơ -> tạo/đăng nhập user. */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const fail = (msg: string) =>
    NextResponse.redirect(`${env.appUrl}/login?error=${encodeURIComponent(msg)}`);

  if (url.searchParams.get("error")) return fail("Bạn đã hủy đăng nhập Google");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.cookies.get("g_oauth_state")?.value;
  const nextRaw = req.cookies.get("g_oauth_next")?.value || "/";
  const next = nextRaw.startsWith("/") ? nextRaw : "/";

  if (!code || !state || !cookieState || state !== cookieState) {
    return fail("Phiên đăng nhập Google không hợp lệ, vui lòng thử lại");
  }

  let profile;
  try {
    profile = await exchangeCode(code);
  } catch (e) {
    console.error("Google OAuth:", e);
    return fail("Không xác thực được với Google");
  }
  if (!profile.email) return fail("Tài khoản Google không có email");

  let user = await prisma.user.findUnique({ where: { email: profile.email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: profile.email,
        name: profile.name,
        googleId: profile.sub,
        image: profile.picture,
        role: "BUYER",
      },
    });
  } else if (!user.googleId) {
    // liên kết tài khoản email sẵn có với Google
    user = await prisma.user.update({
      where: { id: user.id },
      data: { googleId: profile.sub, image: user.image ?? profile.picture },
    });
  }

  if (user.isBlocked) return fail("Tài khoản đã bị khóa");

  const cookie = await buildSessionCookie({
    uid: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
  const res = NextResponse.redirect(`${env.appUrl}${next}`);
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  res.cookies.delete("g_oauth_state");
  res.cookies.delete("g_oauth_next");
  return res;
}
