import { redirect } from "next/navigation";
import { redirectError } from "@/lib/nav";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { formatVnd } from "@/lib/money";
import { PLAN_LABELS } from "@/lib/constants";
import {
  mockPaySuccessAction,
  mockPayFailAction,
  mockSubSuccessAction,
  mockSubFailAction,
} from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert } from "@/components/ui";
import { mockGatewayEnabled } from "@/lib/gateway";

export const dynamic = "force-dynamic";

export default async function MockPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; sub?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  if (!mockGatewayEnabled()) redirectError("/cart?error=Cổng thanh toán giả lập đã bị vô hiệu");

  // Luồng subscription
  if (sp.sub) {
    const sub = await prisma.subscription.findUnique({ where: { id: sp.sub } });
    if (!sub || sub.userId !== user.id) redirect("/subscription");
    if (sub.status === "ACTIVE") redirect("/subscription?activated=1");
    return (
      <Gateway title={`Đăng ký gói ${PLAN_LABELS[sub.plan]}`} amount={sub.priceVnd} ref={sub.id.slice(-8)}>
        <form action={mockSubSuccessAction}>
          <input type="hidden" name="subId" value={sub.id} />
          <SubmitButton className="btn-primary w-full">Thanh toán thành công</SubmitButton>
        </form>
        <form action={mockSubFailAction}>
          <input type="hidden" name="subId" value={sub.id} />
          <SubmitButton className="btn-outline w-full">Mô phỏng thất bại</SubmitButton>
        </form>
      </Gateway>
    );
  }

  // Luồng mua ảnh
  const order = sp.order ? await prisma.order.findUnique({ where: { id: sp.order } }) : null;
  if (!order || order.buyerId !== user.id) redirect("/cart");
  if (order.status === "PAID") redirect(`/payment/result?status=success&order=${order.id}`);

  return (
    <Gateway title="Thanh toán đơn hàng" amount={order.totalVnd} ref={order.id.slice(-8)}>
      <form action={mockPaySuccessAction}>
        <input type="hidden" name="orderId" value={order.id} />
        <SubmitButton className="btn-primary w-full">Thanh toán thành công</SubmitButton>
      </form>
      <form action={mockPayFailAction}>
        <input type="hidden" name="orderId" value={order.id} />
        <SubmitButton className="btn-outline w-full">Mô phỏng thất bại</SubmitButton>
      </form>
    </Gateway>
  );
}

function Gateway({
  title,
  amount,
  ref,
  children,
}: {
  title: string;
  amount: number;
  ref: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto mt-8 max-w-md">
      <div className="card p-6">
        <div className="mb-4 rounded-lg bg-gray-900 p-4 text-center text-white">
          <p className="text-xs uppercase tracking-wide text-gray-400">Cổng thanh toán giả lập · {title}</p>
          <p className="mt-1 text-2xl font-bold">{formatVnd(amount)}</p>
          <p className="text-xs text-gray-400">Mã: {ref.toUpperCase()}</p>
        </div>
        <Alert kind="info">
          Cổng giả lập dùng khi chưa cấu hình VNPay. Chọn kết quả để tiếp tục.
        </Alert>
        <div className="mt-5 grid grid-cols-2 gap-3">{children}</div>
      </div>
    </div>
  );
}
