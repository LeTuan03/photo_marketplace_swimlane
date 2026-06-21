"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword, DUMMY_HASH } from "@/lib/password";
import { createSession, destroySession, getCurrentUser } from "@/lib/auth";
import { notifyAdmins } from "@/lib/notifications";
import { registerSchema, loginSchema, safeInternalPath } from "@/lib/validation";

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
  redirect(safeInternalPath(next));
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
  // LUÔN chạy một phép so sánh bcrypt (dùng hash giả nếu user/hash không có) để
  // không lộ qua timing là email có tồn tại / có phải tài khoản chỉ-Google không.
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);

  // Thông báo CHUNG cho mọi trường hợp sai (không tồn tại / chỉ-Google / sai mật
  // khẩu) -> chống account enumeration.
  if (!user || !user.passwordHash || !ok) {
    back("/login", "Sai email hoặc mật khẩu", { email });
  }
  // Đến đây mật khẩu đã đúng -> mới được phép báo trạng thái khóa.
  if (user!.isBlocked) back("/login", "Tài khoản đã bị khóa");

  await createSession({ uid: user!.id, email: user!.email, name: user!.name, role: user!.role });
  redirect(safeInternalPath(next));
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

/**
 * Gửi YÊU CẦU mở kênh bán (S1) — KHÔNG nâng role ngay. Người dùng vẫn là BUYER tới khi
 * admin duyệt ở /admin/sellers (chống tự cấp quyền bán + thấy chức năng bán khi chưa duyệt).
 */
export async function requestSellerAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/become-seller");
  if (user!.role === "SELLER" || user!.role === "ADMIN") redirect("/seller");

  // Chỉ tạo 1 yêu cầu đang chờ tại một thời điểm (cho phép gửi lại sau khi bị từ chối).
  const pending = await prisma.sellerApplication.findFirst({
    where: { userId: user!.id, status: "PENDING" },
    select: { id: true },
  });
  if (!pending) {
    const pitch = String(formData.get("pitch") ?? "").slice(0, 1000);
    await prisma.sellerApplication.create({ data: { userId: user!.id, pitch } });
    await notifyAdmins(
      "Yêu cầu mở kênh bán mới",
      `${user!.name} (${user!.email}) muốn trở thành người bán.`,
      "/admin/sellers",
    );
  }
  redirect("/profile?seller_requested=1");
}
