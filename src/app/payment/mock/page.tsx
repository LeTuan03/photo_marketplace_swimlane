import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { formatVnd } from "@/lib/money";
import { mockPaySuccessAction, mockPayFailAction } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function MockPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order: orderId } = await searchParams;
  const user = await requireUser();
  const order = orderId ? await prisma.order.findUnique({ where: { id: orderId } }) : null;
  if (!order || order.buyerId !== user.id) redirect("/cart");
  if (order.status === "PAID") redirect(`/payment/result?status=success&order=${order.id}`);

  return (
    <div className="mx-auto mt-8 max-w-md">
      <div className="card p-6">
        <div className="mb-4 rounded-lg bg-gray-900 p-4 text-center text-white">
          <p className="text-xs uppercase tracking-wide text-gray-400">Cổng thanh toán giả lập</p>
          <p className="mt-1 text-2xl font-bold">{formatVnd(order.totalVnd)}</p>
          <p className="text-xs text-gray-400">Mã đơn: {order.id.slice(-8).toUpperCase()}</p>
        </div>

        <Alert kind="info">
          Đây là cổng giả lập dùng khi chưa cấu hình VNPay. Hãy chọn kết quả để tiếp tục luồng escrow.
        </Alert>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <form action={mockPaySuccessAction}>
            <input type="hidden" name="orderId" value={order.id} />
            <SubmitButton className="btn-primary w-full">Thanh toán thành công</SubmitButton>
          </form>
          <form action={mockPayFailAction}>
            <input type="hidden" name="orderId" value={order.id} />
            <SubmitButton className="btn-outline w-full">Mô phỏng thất bại</SubmitButton>
          </form>
        </div>
      </div>
    </div>
  );
}
