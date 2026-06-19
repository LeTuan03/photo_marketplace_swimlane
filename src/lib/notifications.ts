import "server-only";
import { prisma } from "./prisma";
import { sendEmail, emailLayout } from "./email";
import { env } from "./env";
import type { NotificationType } from "@prisma/client";

type NotifyArgs = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  email?: boolean; // có gửi email không
};

/**
 * Tạo notification trong DB và (tuỳ chọn) gửi email.
 * Đây là điểm trung tâm cho 12 trigger event ở Lane 6 của sơ đồ.
 */
export async function notify(args: NotifyArgs) {
  const user = await prisma.user.findUnique({
    where: { id: args.userId },
    select: { email: true, name: true },
  });
  if (!user) return;

  let emailSent = false;
  if (args.email) {
    const linkHtml = args.link
      ? `<p style="margin-top:16px"><a href="${env.appUrl}${args.link}" style="background:#4f46e5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Xem chi tiết</a></p>`
      : "";
    emailSent = await sendEmail({
      to: user.email,
      subject: `[Picseo] ${args.title}`,
      html: emailLayout(args.title, `<p>Xin chào ${user.name},</p><p>${args.body}</p>${linkHtml}`),
      text: `${args.title}\n\n${args.body}`,
    });
  }

  await prisma.notification.create({
    data: {
      userId: args.userId,
      type: args.type,
      title: args.title,
      body: args.body,
      link: args.link,
      emailSent,
    },
  });
}

/** Gửi alert cho toàn bộ admin (N12). */
export async function notifyAdmins(title: string, body: string, link?: string) {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  await Promise.all(
    admins.map((a) =>
      notify({ userId: a.id, type: "ADMIN_ALERT", title, body, link, email: false }),
    ),
  );
}
