import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { setKycAction, toggleBlockAction, setTierAction } from "../actions";
import { TIER_LABELS } from "@/lib/constants";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const kycBadge: Record<string, string> = {
  NONE: "bg-gray-100 text-gray-600",
  PENDING: "bg-amber-100 text-amber-800",
  VERIFIED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-800",
};

export default async function AdminUsersPage() {
  await requireRole("ADMIN");
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { _count: { select: { photos: true } } },
  });

  return (
    <div>
      <PageHeader title="Người dùng" subtitle={`${users.length} tài khoản`} />
      <div className="space-y-3">
        {users.map((u) => (
          <div key={u.id} className="card flex flex-wrap items-center gap-3 p-4 text-sm">
            <div className="min-w-[200px] flex-1">
              <p className="font-medium text-gray-900">
                {u.name} {u.isBlocked && <span className="badge bg-red-100 text-red-800">Đã khóa</span>}
              </p>
              <p className="text-xs text-gray-500">{u.email}</p>
            </div>
            <span className="badge bg-gray-100 text-gray-700">{u.role}</span>
            <span className={`badge ${kycBadge[u.kycStatus]}`}>KYC: {u.kycStatus}</span>
            {u.role !== "BUYER" && <span className="badge bg-brand-50 text-brand-700">{TIER_LABELS[u.sellerTier]}</span>}
            <span className="text-xs text-gray-400">{u._count.photos} ảnh</span>
            {u.ratingCount > 0 && (
              <span className="badge bg-amber-50 text-amber-700">★ {(u.ratingSum / u.ratingCount).toFixed(1)} ({u.ratingCount})</span>
            )}
            {u.penaltyPoints > 0 && (
              <span className="badge bg-red-100 text-red-800">−{u.penaltyPoints} điểm phạt</span>
            )}

            {u.role !== "ADMIN" && (
              <div className="flex flex-wrap items-center gap-2">
                {u.kycStatus !== "VERIFIED" && (
                  <form action={setKycAction}>
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="status" value="VERIFIED" />
                    <button className="btn-outline px-2 py-1 text-xs">Duyệt KYC</button>
                  </form>
                )}
                {u.role === "SELLER" && (
                  <form action={setTierAction} className="flex items-center gap-1">
                    <input type="hidden" name="userId" value={u.id} />
                    <select name="tier" defaultValue={u.sellerTier} className="input px-2 py-1 text-xs">
                      <option value="NEW">Mới (30%)</option>
                      <option value="PRO">Pro (20%)</option>
                      <option value="ELITE">Elite (10%)</option>
                    </select>
                    <button className="btn-outline px-2 py-1 text-xs">Lưu</button>
                  </form>
                )}
                <form action={toggleBlockAction}>
                  <input type="hidden" name="userId" value={u.id} />
                  <button className={`px-2 py-1 text-xs ${u.isBlocked ? "btn-outline" : "btn-danger"}`}>
                    {u.isBlocked ? "Mở khóa" : "Khóa"}
                  </button>
                </form>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
