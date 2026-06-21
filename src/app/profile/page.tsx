import Link from "next/link";
import { Receipt, Library, Heart, Wallet, ShieldCheck, Store } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { formatVnd } from "@/lib/money";
import { TIER_LABELS, PLAN_LABELS } from "@/lib/constants";
import { becomeSellerAction } from "@/app/(auth)/actions";
import { updateProfileAction } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader, Alert } from "@/components/ui";
import type { KycStatus, Role } from "@prisma/client";

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<Role, string> = { BUYER: "Người mua", SELLER: "Người bán", ADMIN: "Quản trị viên" };
const KYC_LABELS: Record<KycStatus, { label: string; cls: string }> = {
  NONE: { label: "Chưa xác minh", cls: "bg-gray-100 text-gray-700" },
  PENDING: { label: "Đang chờ xác minh", cls: "bg-amber-100 text-amber-800" },
  VERIFIED: { label: "Đã xác minh", cls: "bg-emerald-100 text-emerald-800" },
  REJECTED: { label: "Bị từ chối", cls: "bg-red-100 text-red-800" },
};

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  const isSeller = user.role === "SELLER" || user.role === "ADMIN";
  const orders = await prisma.order.count({ where: { buyerId: user.id, status: "PAID" } });
  const avgRating = user.ratingCount > 0 ? (user.ratingSum / user.ratingCount).toFixed(1) : null;
  const initials = (user.name || user.email).slice(0, 2).toUpperCase();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Tài khoản" subtitle="Thông tin cá nhân, gói và đăng ký bán hàng." />

      {sp.saved && <div className="mb-4"><Alert kind="success">Đã lưu thông tin tài khoản.</Alert></div>}
      {sp.error && <div className="mb-4"><Alert kind="error">{decodeURIComponent(sp.error)}</Alert></div>}

      {/* Hồ sơ */}
      <div className="card p-6">
        <div className="flex items-center gap-4">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt={user.name} className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-700">
              {initials}
            </div>
          )}
          <div>
            <p className="text-lg font-semibold text-gray-900">{user.name}</p>
            <p className="text-sm text-gray-500">{user.email}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="badge bg-gray-100 text-gray-700">{ROLE_LABELS[user.role]}</span>
              <span className="text-xs text-gray-400">Tham gia {new Date(user.createdAt).toLocaleDateString("vi-VN")}</span>
            </div>
          </div>
          <div className="ml-auto text-right text-sm">
            <p className="text-gray-500">Đơn đã mua</p>
            <p className="text-2xl font-bold text-gray-900">{orders}</p>
          </div>
        </div>

        <form action={updateProfileAction} className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Tên hiển thị</label>
            <input name="name" defaultValue={user.name} className="input" maxLength={80} required />
          </div>
          <div>
            <label className="label">Email</label>
            <input value={user.email} className="input bg-gray-50" disabled />
            <p className="mt-1 text-xs text-gray-400">Email không thể thay đổi.</p>
          </div>
          {isSeller && (
            <>
              <div>
                <label className="label">Phương thức nhận tiền</label>
                <select name="payoutMethod" className="input" defaultValue={user.payoutMethod ?? "BANK"}>
                  <option value="BANK">Chuyển khoản ngân hàng</option>
                  <option value="PAYPAL">PayPal</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label">Thông tin nhận tiền</label>
                <input name="payoutAccount" defaultValue={user.payoutAccount ?? ""} className="input" placeholder="Số TK / email PayPal" maxLength={200} />
                <p className="mt-1 text-xs text-gray-400">Dùng làm mặc định khi rút tiền.</p>
              </div>
            </>
          )}
          <div className="sm:col-span-2">
            <SubmitButton className="btn-primary">Lưu thay đổi</SubmitButton>
          </div>
        </form>
      </div>

      {/* Gói subscription */}
      <div className="card mt-6 flex flex-wrap items-center gap-4 p-5">
        <div>
          <p className="text-sm text-gray-500">Gói hiện tại</p>
          <p className="font-semibold text-gray-900">
            {PLAN_LABELS[user.planType]}
            {user.planType !== "FREE" && user.planRenewsAt && (
              <span className="ml-2 text-xs font-normal text-gray-400">
                hiệu lực tới {new Date(user.planRenewsAt).toLocaleDateString("vi-VN")}
              </span>
            )}
          </p>
        </div>
        <Link href="/subscription" className="btn-outline ml-auto">Quản lý gói</Link>
      </div>

      {/* Kênh người bán */}
      {isSeller ? (
        <div className="card mt-6 p-5">
          <div className="flex items-center gap-2">
            <Store className="h-5 w-5 text-brand-700" />
            <h2 className="font-semibold text-gray-900">Kênh người bán</h2>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-gray-500">Hạng (tier)</p>
              <p className="font-medium text-gray-900">{TIER_LABELS[user.sellerTier]}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Xác minh KYC</p>
              <span className={`badge ${KYC_LABELS[user.kycStatus].cls}`}>{KYC_LABELS[user.kycStatus].label}</span>
            </div>
            <div>
              <p className="text-xs text-gray-500">Đánh giá</p>
              <p className="font-medium text-gray-900">{avgRating ? `${avgRating}★ (${user.ratingCount})` : "Chưa có"}</p>
            </div>
          </div>
          {user.kycStatus !== "VERIFIED" && (
            <div className="mt-4">
              <Alert kind="info">Cần xác minh danh tính (KYC) trước khi rút tiền. Liên hệ quản trị viên để xác minh.</Alert>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/seller" className="btn-primary"><Store className="h-4 w-4" /> Trang quản lý bán</Link>
            <Link href="/seller/earnings" className="btn-outline"><Wallet className="h-4 w-4" /> Thu nhập ({formatVnd(user.balanceVnd)})</Link>
          </div>
        </div>
      ) : (
        <div className="card mt-6 p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-brand-700" />
            <h2 className="font-semibold text-gray-900">Trở thành người bán</h2>
          </div>
          <p className="mt-2 text-sm text-gray-600">
            Đăng ký kênh bán để upload và kiếm tiền từ ảnh của bạn. Sau khi đăng ký bạn cần xác minh danh tính (KYC)
            để rút tiền. Hoa hồng nền tảng áp theo hạng (Mới 30% · Pro 20% · Elite 10%).
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-600">
            <li>Upload ảnh JPG/PNG/WebP, tối đa 50MB mỗi ảnh</li>
            <li>Đặt giá theo từng loại license</li>
            <li>Tiền bán giữ trong escrow 7 ngày rồi giải ngân</li>
          </ul>
          <form action={becomeSellerAction} className="mt-4">
            <SubmitButton className="btn-primary">Đăng ký làm người bán</SubmitButton>
          </form>
        </div>
      )}

      {/* Liên kết nhanh */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Link href="/orders" className="card flex items-center gap-2 p-4 text-sm font-medium text-gray-700 hover:text-gray-900">
          <Receipt className="h-4 w-4 text-brand-700" /> Lịch sử mua
        </Link>
        <Link href="/library" className="card flex items-center gap-2 p-4 text-sm font-medium text-gray-700 hover:text-gray-900">
          <Library className="h-4 w-4 text-brand-700" /> Thư viện
        </Link>
        <Link href="/wishlist" className="card flex items-center gap-2 p-4 text-sm font-medium text-gray-700 hover:text-gray-900">
          <Heart className="h-4 w-4 text-brand-700" /> Yêu thích
        </Link>
      </div>
    </div>
  );
}
