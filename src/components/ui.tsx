import Link from "next/link";
import type { ReactNode } from "react";
import type { PhotoStatus, OrderStatus, PayoutStatus, EscrowStatus, SwapStatus } from "@prisma/client";
import { formatVnd } from "@/lib/money";

export function Price({ amount, className = "" }: { amount: number; className?: string }) {
  return <span className={className}>{formatVnd(amount)}</span>;
}

const photoStatusMap: Record<PhotoStatus, { label: string; cls: string }> = {
  DRAFT: { label: "Nháp", cls: "bg-gray-100 text-gray-700" },
  PENDING: { label: "Chờ duyệt", cls: "bg-amber-100 text-amber-800" },
  LIVE: { label: "Đang bán", cls: "bg-emerald-100 text-emerald-800" },
  REJECTED: { label: "Bị từ chối", cls: "bg-red-100 text-red-800" },
  HIDDEN: { label: "Đã ẩn", cls: "bg-gray-200 text-gray-700" },
  LOCKED: { label: "Đang swap", cls: "bg-fuchsia-100 text-fuchsia-800" },
  DMCA_HOLD: { label: "Khiếu nại DMCA", cls: "bg-red-100 text-red-800" },
  REMOVED: { label: "Đã gỡ", cls: "bg-red-100 text-red-800" },
};

const orderStatusMap: Record<OrderStatus, { label: string; cls: string }> = {
  PENDING: { label: "Chờ thanh toán", cls: "bg-amber-100 text-amber-800" },
  PAID: { label: "Đã thanh toán", cls: "bg-emerald-100 text-emerald-800" },
  FAILED: { label: "Thất bại", cls: "bg-red-100 text-red-800" },
  CANCELLED: { label: "Đã hủy", cls: "bg-gray-200 text-gray-700" },
  REFUNDED: { label: "Đã hoàn tiền", cls: "bg-orange-100 text-orange-800" },
};

const payoutStatusMap: Record<PayoutStatus, { label: string; cls: string }> = {
  REQUESTED: { label: "Chờ xử lý", cls: "bg-amber-100 text-amber-800" },
  PROCESSING: { label: "Đang chuyển", cls: "bg-blue-100 text-blue-800" },
  PAID: { label: "Đã chi trả", cls: "bg-emerald-100 text-emerald-800" },
  REJECTED: { label: "Từ chối", cls: "bg-red-100 text-red-800" },
};

const escrowStatusMap: Record<EscrowStatus, { label: string; cls: string }> = {
  HELD: { label: "Đang giữ", cls: "bg-amber-100 text-amber-800" },
  RELEASED: { label: "Đã giải ngân", cls: "bg-emerald-100 text-emerald-800" },
  REFUNDED: { label: "Đã hoàn", cls: "bg-orange-100 text-orange-800" },
  FROZEN: { label: "Đóng băng", cls: "bg-red-100 text-red-800" },
};

const swapStatusMap: Record<SwapStatus, { label: string; cls: string }> = {
  PENDING: { label: "Chờ trả lời", cls: "bg-amber-100 text-amber-800" },
  ACCEPTED: { label: "Chờ xác nhận cuối", cls: "bg-fuchsia-100 text-fuchsia-800" },
  COMPLETED: { label: "Hoàn tất", cls: "bg-emerald-100 text-emerald-800" },
  DECLINED: { label: "Từ chối", cls: "bg-gray-200 text-gray-700" },
  EXPIRED: { label: "Hết hạn", cls: "bg-gray-200 text-gray-700" },
  CANCELLED: { label: "Đã huỷ", cls: "bg-red-100 text-red-800" },
};

export function SwapStatusBadge({ status }: { status: SwapStatus }) {
  const m = swapStatusMap[status];
  return <span className={`badge ${m.cls}`}>{m.label}</span>;
}

export function PhotoStatusBadge({ status }: { status: PhotoStatus }) {
  const m = photoStatusMap[status];
  return <span className={`badge ${m.cls}`}>{m.label}</span>;
}
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const m = orderStatusMap[status];
  return <span className={`badge ${m.cls}`}>{m.label}</span>;
}
export function PayoutStatusBadge({ status }: { status: PayoutStatus }) {
  const m = payoutStatusMap[status];
  return <span className={`badge ${m.cls}`}>{m.label}</span>;
}
export function EscrowStatusBadge({ status }: { status: EscrowStatus }) {
  const m = escrowStatusMap[status];
  return <span className={`badge ${m.cls}`}>{m.label}</span>;
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 p-10 text-center">
      <p className="text-lg font-medium text-gray-700">{title}</p>
      {hint && <p className="max-w-md text-sm text-gray-500">{hint}</p>}
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

export function Alert({ kind = "info", children }: { kind?: "info" | "error" | "success"; children: ReactNode }) {
  const cls =
    kind === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : kind === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : "border-blue-200 bg-blue-50 text-blue-800";
  return <div className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900">
      {children}
    </Link>
  );
}
