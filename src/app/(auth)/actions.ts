"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createSession, destroySession, getCurrentUser } from "@/lib/auth";
import { registerSchema, loginSchema } from "@/lib/validation";

function back(path: string, error: string, extra?: Record<string, string>) {
  const qs = new URLSearchParams({ error, ...(extra ?? {}) });
  redirect(`${path}?${qs.toString()}`);
}

export async function registerAction(formData: FormData) {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role") ?? "BUYER",
  });
  const next = String(formData.get("next") ?? "/");

  if (!parsed.success) {
    back("/register", parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  }
  const data = parsed.data!;

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) back("/register", "Email đã được sử dụng");

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash: await hashPassword(data.password),
      role: data.role,
    },
  });

  await createSession({ uid: user.id, email: user.email, name: user.name, role: user.role });
  redirect(next.startsWith("/") ? next : "/");
}

export async function loginAction(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const next = String(formData.get("next") ?? "/");

  if (!parsed.success) back("/login", "Email hoặc mật khẩu không hợp lệ");
  const { email, password } = parsed.data!;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) back("/login", "Sai email hoặc mật khẩu", { email });
  if (!user!.passwordHash) {
    back("/login", "Tài khoản này đăng nhập bằng Google. Vui lòng dùng nút đăng nhập Google.", { email });
  }
  if (!(await verifyPassword(password, user!.passwordHash!))) {
    back("/login", "Sai email hoặc mật khẩu", { email });
  }
  if (user!.isBlocked) back("/login", "Tài khoản đã bị khóa");

  await createSession({ uid: user!.id, email: user!.email, name: user!.name, role: user!.role });
  redirect(next.startsWith("/") ? next : "/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

/** Nâng cấp tài khoản BUYER hiện tại thành SELLER (đăng ký bán — S1). */
export async function becomeSellerAction() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/become-seller");
  if (user!.role === "BUYER") {
    await prisma.user.update({ where: { id: user!.id }, data: { role: "SELLER", kycStatus: "PENDING" } });
    await createSession({ uid: user!.id, email: user!.email, name: user!.name, role: "SELLER" });
  }
  redirect("/seller");
}
