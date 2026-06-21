import { redirect } from "next/navigation";
import { redirectError } from "@/lib/nav";
import Link from "next/link";
import { Loader2, CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { formatVnd } from "@/lib/money";
import { isConfigured, bankInfo, resolveQr } from "@/lib/bankqr";
import { AutoRefresh } from "@/components/AutoRefresh";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader, Alert } from "@/components/ui";
import { notifyBankTransferAction } from "./actions";

export const dynamic = "force-dynamic";

/** Trang chuyển khoản VietQR: hiển thị mã QR + thông tin; admin xác nhận thủ công sau khi nhận tiền. */
export default async function BankPaymentPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ order?: string; sub?: string; notified?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const notified = sp.notified === "1";

  // Xác định mục cần thanh toán: đơn mua ảnh hoặc gói subscription.
  let memo = "";
  let amountVnd = 0;
  let title = "";
  const hidden: { name: string; value: string } = { name: "orderId", value: "" };

  if (sp.order) {
    const order = await prisma.order.findFirst({ where: { id: sp.order, buyerId: user.id } });
    if (!order) redirectError("/cart?error=Đơn hàng không hợp lệ");
    if (order!.status === "PAID") redirect(`/payment/result?status=success&order=${order!.id}`);
    memo = order!.providerTxnRef ?? "";
    amountVnd = order!.totalVnd;
    title = `Đơn hàng ${order!.id.slice(-8).toUpperCase()}`;
    hidden.name = "orderId";
    hidden.value = order!.id;
  } else if (sp.sub) {
    const sub = await prisma.subscription.findFirst({ where: { id: sp.sub, userId: user.id } });
    if (!sub) redirectError("/subscription?error=Không hợp lệ");
    if (sub!.status === "ACTIVE") redirect("/subscription?activated=1");
    memo = sub!.providerTxnRef ?? "";
    amountVnd = sub!.priceVnd;
    title = `Đăng ký gói ${sub!.plan}`;
    hidden.name = "subId";
    hidden.value = sub!.id;
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
  const qr = resolveQr({ amountVnd, memo });

  return (
    <div>
      {/* Tự làm mới để bắt thời điểm admin xác nhận -> chuyển sang trang thành công */}
      <AutoRefresh seconds={5} />
      <PageHeader
        title="Quét mã để chuyển khoản"
        subtitle="Sau khi bạn chuyển khoản, đơn sẽ được xác nhận khi shop nhận được tiền (thường trong ít phút)."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* QR */}
        <div className="card flex flex-col items-center p-6">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr.url} alt="Mã QR chuyển khoản" width={280} height={280} className="rounded-lg border border-gray-100" />
          ) : (
            <div className="flex h-[280px] w-[280px] items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-400">
              Chưa có mã QR — vui lòng chuyển khoản theo thông tin bên cạnh.
            </div>
          )}
          <p className="mt-3 text-center text-sm text-gray-500">
            {qr && !qr.isStatic
              ? "Mở app ngân hàng → quét QR. Số tiền và nội dung đã được điền sẵn."
              : "Mở app ngân hàng → quét QR, rồi nhập đúng SỐ TIỀN và NỘI DUNG ở bên cạnh."}
          </p>
        </div>

        {/* Thông tin chuyển khoản thủ công */}
        <div className="card space-y-3 p-6">
          <h2 className="font-semibold text-gray-900">{title}</h2>

          <Row label="Ngân hàng" value={bank.bankId || "(theo QR)"} />
          <Row label="Số tài khoản" value={bank.account} mono />
          <Row label="Chủ tài khoản" value={bank.accountName} />
          <Row label="Số tiền" value={formatVnd(amountVnd)} highlight />
          <Row label="Nội dung CK" value={memo} mono highlight />

          <Alert kind="info">
            Vui lòng <strong>ghi đúng nội dung chuyển khoản</strong> <code>{memo}</code> và <strong>đúng số tiền</strong> để
            shop đối chiếu và xác nhận đơn nhanh nhất.
          </Alert>

          {notified ? (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Đã ghi nhận. Đơn sẽ được xác nhận sau khi shop kiểm tra biến động số dư.
            </div>
          ) : (
            <form action={notifyBankTransferAction}>
              <input type="hidden" name={hidden.name} value={hidden.value} />
              <SubmitButton className="btn-primary w-full" pendingText="Đang gửi...">
                Tôi đã chuyển khoản
              </SubmitButton>
            </form>
          )}

          <div className="flex items-center gap-2 pt-1 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
            Đang chờ xác nhận… trang sẽ tự cập nhật khi đơn được duyệt.
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
