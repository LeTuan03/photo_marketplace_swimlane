import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { formatVnd } from "@/lib/money";
import { LICENSE_LABELS } from "@/lib/constants";
import { isConfigured } from "@/lib/vnpay";
import { createOrderAndPayAction } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader, EmptyState, Alert } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const user = await requireUser();
  const items = await prisma.cartItem.findMany({
    where: { userId: user.id },
    include: { photo: { select: { id: true, title: true, status: true, sellerId: true } } },
  });
  const valid = items.filter((i) => i.photo.status === "LIVE" && i.photo.sellerId !== user.id);
  const subtotal = valid.reduce((s, i) => s + i.priceVnd, 0);
  const vnpayReady = isConfigured();

  if (valid.length === 0) {
    return (
      <div>
        <PageHeader title="Thanh toán" />
        <EmptyState title="Không có sản phẩm để thanh toán" action={<Link href="/" className="btn-primary mt-2">Khám phá ảnh</Link>} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Thanh toán" subtitle="Tiền sẽ được giữ trong escrow 7 ngày để bảo vệ giao dịch." />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="card divide-y divide-gray-100 p-4">
          {valid.map((it) => (
            <div key={it.id} className="flex items-center justify-between py-3 text-sm">
              <div>
                <p className="font-medium text-gray-900">{it.photo.title}</p>
                <p className="text-xs text-gray-500">{LICENSE_LABELS[it.licenseType]}</p>
              </div>
              <span className="font-medium">{formatVnd(it.priceVnd)}</span>
            </div>
          ))}
        </div>

        <form action={createOrderAndPayAction} className="card h-fit space-y-4 p-5">
          <h2 className="font-semibold text-gray-900">Tóm tắt thanh toán</h2>

          <div>
            <label className="label">Mã giảm giá</label>
            <input name="coupon" className="input" placeholder="VD: WELCOME10" />
            <p className="mt-1 text-xs text-gray-400">Thử mã <code>WELCOME10</code> (giảm 10%) trong dữ liệu demo.</p>
          </div>

          <div>
            <label className="label">Phương thức thanh toán</label>
            <select name="provider" className="input" defaultValue="VNPAY">
              <option value="VNPAY">VNPay {vnpayReady ? "" : "(sandbox)"}</option>
            </select>
          </div>

          <div className="flex justify-between border-t border-gray-100 pt-3 text-sm text-gray-600">
            <span>Tạm tính</span>
            <span>{formatVnd(subtotal)}</span>
          </div>
          <div className="flex justify-between text-base font-semibold">
            <span>Tổng thanh toán</span>
            <span className="text-brand-700">{formatVnd(subtotal)}</span>
          </div>
          <p className="text-xs text-gray-400">Giảm giá (nếu có) được áp dụng sau khi nhập mã ở bước thanh toán.</p>

          {!vnpayReady && (
            <Alert kind="info">
              Chưa cấu hình VNPay (VNPAY_TMN_CODE/HASH_SECRET). Hệ thống sẽ dùng <strong>cổng thanh toán giả lập</strong> để
              bạn chạy thử toàn bộ luồng. Điền khóa sandbox trong <code>.env</code> để dùng VNPay thật.
            </Alert>
          )}

          <SubmitButton className="btn-primary w-full" pendingText="Đang chuyển tới cổng...">
            Thanh toán {formatVnd(subtotal)}
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
