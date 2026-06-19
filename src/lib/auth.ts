import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";
import { prisma } from "./prisma";
import type { Role } from "@prisma/client";

const COOKIE_NAME = "picseo_session";
const secret = new TextEncoder().encode(env.authSecret);
const MAX_AGE = 60 * 60 * 24 * 7; // 7 ngày

export type SessionPayload = {
  uid: string;
  email: string;
  name: string;
  role: Role;
};

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret);

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** Đọc phiên từ cookie (nhanh, không truy vấn DB). */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      uid: String(payload.uid),
      email: String(payload.email),
      name: String(payload.name),
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}

/** Lấy user đầy đủ từ DB (kiểm tra khóa tài khoản, số dư, tier...). */
export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.uid } });
  if (!user || user.isBlocked) return null;
  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

export async function requireRole(...roles: Role[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new Error("FORBIDDEN");
  return user;
}
