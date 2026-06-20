import { redirect } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { formatVnd } from "@/lib/money";
import { isConfigured, bankInfo, buildQrUrl } from "@/lib/bankqr";
import { AutoRefresh } from "@/components/AutoRefresh";
import { PageHeader, Alert } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Trang chuyển khoản VietQR: hiển thị QR + thông tin, tự xác nhận khi tiền vào. */
export default async function BankPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; sub?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();

  // Xác định mục cần thanh toán: đơn mua ảnh hoặc gói subscription.
  let memo = "";
  let amountVnd = 0;
  let title = "";

  if (sp.order) {
    const order = await prisma.order.findFirst({
      where: { id: sp.order, buyerId: user.id },
    });
    if (!order) redirect("/cart?error=Đơn hàng không hợp lệ");
    if (order!.status === "PAID") redirect(`/payment/result?status=success&order=${order!.id}`);
    memo = order!.providerTxnRef ?? "";
    amountVnd = order!.totalVnd;
    title = `Đơn hàng ${order!.id.slice(-8).toUpperCase()}`;
  } else if (sp.sub) {
    const sub = await prisma.subscription.findFirst({
      where: { id: sp.sub, userId: user.id },
    });
    if (!sub) redirect("/subscription?error=Không hợp lệ");
    if (sub!.status === "ACTIVE") redirect("/subscription?activated=1");
    memo = sub!.providerTxnRef ?? "";
    amountVnd = sub!.priceVnd;
    title = `Đăng ký gói ${sub!.plan}`;
  } else {
    redirect("/cart");
  }

  if (!isConfigured()) {
    return (
      <div>
        <PageHeader title="Chuyển khoản QR" />
        <Alert kind="error">Chưa cấu hình tài khoản ngân hàng nhận tiền. Vui lòng liên hệ quản trị.</Alert>
      </div>
    );
  }

  const bank = bankInfo();
  const qrUrl = buildQrUrl({ amountVnd, memo });

  return (
    <div>
      <AutoRefresh seconds={4} />
      <PageHeader title="Quét mã để chuyển khoản" subtitle="Đơn sẽ tự động xác nhận ngay khi nhận được tiền." />

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* QR */}
        <div className="card flex flex-col items-center p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl} alt="VietQR chuyển khoản" width={280} height={280} className="rounded-lg border border-gray-100" />
          <p className="mt-3 text-center text-sm text-gray-500">
            Mở app ngân hàng / ví → quét QR. Số tiền và nội dung đã được điền sẵn.
          </p>
        </div>

        {/* Thông tin chuyển khoản thủ công */}
        <div className="card space-y-3 p-6">
          <h2 className="font-semibold text-gray-900">{title}</h2>

          <Row label="Ngân hàng" value={bank.bankId} />
          <Row label="Số tài khoản" value={bank.account} mono />
          <Row label="Chủ tài khoản" value={bank.accountName} />
          <Row label="Số tiền" value={formatVnd(amountVnd)} highlight />
          <Row label="Nội dung CK" value={memo} mono highlight />

          <Alert kind="info">
            Vui lòng <strong>giữ nguyên nội dung chuyển khoản</strong> <code>{memo}</code> để hệ thống tự khớp đơn.
            Chuyển sai nội dung hoặc sai số tiền sẽ không tự xác nhận được.
          </Alert>

          <div className="flex items-center gap-2 pt-1 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
            Đang chờ thanh toán… trang sẽ tự cập nhật.
          </div>

          <div className="pt-1">
            <Link href="/cart" className="btn-outline">Hủy</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  highlight,
}: Readonly<{ label: string; value: string; mono?: boolean; highlight?: boolean }>) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 pb-2 text-sm last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className={`${mono ? "font-mono" : ""} ${highlight ? "font-semibold text-brand-700" : "text-gray-900"}`}>
        {value}
      </span>
    </div>
  );
}
