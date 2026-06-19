import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "dev-insecure-auth-secret-change-me",
);

const COOKIE_NAME = "picseo_session";

async function getRole(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return (payload.role as string) ?? null;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const role = await getRole(req);

  const needsAuth =
    pathname.startsWith("/seller") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/library") ||
    pathname.startsWith("/cart") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/notifications") ||
    pathname.startsWith("/wishlist");

  if (needsAuth && !role) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/admin") && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (pathname.startsWith("/seller") && role !== "SELLER" && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/become-seller", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/seller/:path*",
    "/admin/:path*",
    "/library/:path*",
    "/cart/:path*",
    "/checkout/:path*",
    "/notifications/:path*",
    "/wishlist/:path*",
  ],
};
