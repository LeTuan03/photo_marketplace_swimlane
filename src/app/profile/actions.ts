"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { redirectError } from "@/lib/nav";
import { prisma } from "@/lib/prisma";
import { requireUser, createSession } from "@/lib/auth";

const PAYOUT_METHODS = new Set(["BANK", "PAYPAL"]);

/** Cập nhật thông tin tài khoản: tên + (người bán) thông tin nhận tiền mặc định. */
export async function updateProfileAction(formData: FormData) {
  const user = await requireUser();

  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  if (name.length < 2) {
    redirectError("/profile?error=Tên tối thiểu 2 ký tự");
  }

  // Thông tin nhận tiền chỉ áp dụng cho người bán (dùng làm mặc định khi rút tiền).
  const data: { name: string; payoutMethod?: string; payoutAccount?: string | null } = { name };
  if (user.role === "SELLER" || user.role === "ADMIN") {
    const method = String(formData.get("payoutMethod") ?? "");
    if (method && PAYOUT_METHODS.has(method)) data.payoutMethod = method;
    const account = String(formData.get("payoutAccount") ?? "").trim().slice(0, 200);
    data.payoutAccount = account || null;
  }

  await prisma.user.update({ where: { id: user.id }, data });

  // Tên nằm trong JWT phiên (hiển thị ở navbar/email) -> ký lại phiên để đồng bộ ngay.
  if (name !== user.name) {
    await createSession({ uid: user.id, email: user.email, name, role: user.role });
  }

  revalidatePath("/profile");
  redirect("/profile?saved=1");
}
