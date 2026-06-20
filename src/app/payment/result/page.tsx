import Link from "next/link";
import { CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { formatVnd } from "@/lib/money";
import { AutoRefresh } from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  invalid: "Chữ ký không hợp lệ. Giao dịch không được xác thực.",
  notfound: "Không tìm thấy đơn hàng.",
  amount_mismatch: "Số tiền thanh toán không khớp với đơn hàng.",
  failed: "Thanh toán không thành công hoặc đã bị hủy.",
};

export default async function PaymentResultPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; order?: string }>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const order =
    sp.order && user
      ? await prisma.order.findFirst({
          where: { id: sp.order, buyerId: user.id },
          include: { items: true },
        })
      : null;

  const success = sp.status === "success" && order?.status === "PAID";
  // Người mua quay về (PayOS) trước khi webhook kịp xác nhận: đơn còn PENDING.
  const processing = sp.status === "success" && !!order && order.status === "PENDING";

  return (
    <div className="mx-auto mt-8 max-w-lg">
      <div className="card p-8 text-center">
        {processing && <AutoRefresh seconds={3} />}
        {processing ? (
          <>
            <Loader2 className="mx-auto h-14 w-14 animate-spin text-brand-500" />
            <h1 className="mt-3 text-2xl font-bold text-gray-900">Đang xác nhận thanh toán…</h1>
            <p className="mt-2 text-sm text-gray-600">
              Đơn hàng <strong>{order!.id.slice(-8).toUpperCase()}</strong> · {formatVnd(order!.totalVnd)}. Hệ thống
              đang chờ xác nhận từ cổng thanh toán — trang sẽ tự cập nhật trong giây lát.
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <Link href="/library" className="btn-outline">Tới thư viện</Link>
            </div>
          </>
        ) : success ? (
          <>
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
            <h1 className="mt-3 text-2xl font-bold text-gray-900">Thanh toán thành công!</h1>
            <p className="mt-2 text-sm text-gray-600">
              Đơn hàng <strong>{order!.id.slice(-8).toUpperCase()}</strong> · {formatVnd(order!.totalVnd)} ·{" "}
              {order!.items.length} ảnh
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Email xác nhận kèm link tải và certificate đã được gửi. Tiền đang được giữ trong escrow để bảo vệ giao dịch.
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <Link href="/library" className="btn-primary">Tới thư viện & tải ảnh</Link>
              <Link href="/" className="btn-outline">Tiếp tục mua</Link>
            </div>
          </>
        ) : sp.status === "failed" ? (
          <>
            <XCircle className="mx-auto h-14 w-14 text-red-500" />
            <h1 className="mt-3 text-2xl font-bold text-gray-900">Thanh toán thất bại</h1>
            <p className="mt-2 text-sm text-gray-600">{messages.failed}</p>
            <div className="mt-5 flex justify-center gap-2">
              <Link href="/checkout" className="btn-primary">Thử lại</Link>
              <Link href="/cart" className="btn-outline">Về giỏ hàng</Link>
            </div>
          </>
        ) : (
          <>
            <AlertTriangle className="mx-auto h-14 w-14 text-amber-500" />
            <h1 className="mt-3 text-2xl font-bold text-gray-900">Không xác thực được giao dịch</h1>
            <p className="mt-2 text-sm text-gray-600">{messages[sp.status ?? ""] ?? "Đã xảy ra lỗi."}</p>
            <Link href="/" className="btn-primary mt-5">Về trang chủ</Link>
          </>
        )}
      </div>
    </div>
  );
}
