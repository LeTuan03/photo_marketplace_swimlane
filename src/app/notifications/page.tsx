import Link from "next/link";
import { Bell } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { PageHeader, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser();

  const items = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // đánh dấu đã đọc khi xem
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Thông báo" />
      {items.length === 0 ? (
        <EmptyState title="Chưa có thông báo" hint="Các sự kiện về đơn hàng, duyệt ảnh, giải ngân sẽ hiển thị ở đây." />
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const inner = (
              <div className={`card p-4 ${!n.readAt ? "border-l-4 border-l-brand-500" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-brand-50 p-2 text-brand-600">
                    <Bell className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{n.title}</p>
                    <p className="mt-0.5 text-sm text-gray-600">{n.body}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {new Date(n.createdAt).toLocaleString("vi-VN")}
                      {n.emailSent && " · đã gửi email"}
                    </p>
                  </div>
                </div>
              </div>
            );
            return n.link ? (
              <Link key={n.id} href={n.link} className="block">{inner}</Link>
            ) : (
              <div key={n.id}>{inner}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
