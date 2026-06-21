import Link from "next/link";
import { Download, BadgeCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { publicAssetUrl } from "@/lib/storage";
import { LICENSE_LABELS } from "@/lib/constants";
import { requestDownloadAction } from "./actions";
import { DownloadButton } from "@/components/DownloadButton";
import { PageHeader, EmptyState, Alert } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();

  const grants = await prisma.downloadGrant.findMany({
    where: { buyerId: user.id },
    orderBy: { createdAt: "desc" },
    include: { photo: { select: { id: true, title: true, thumbKey: true } } },
  });

  return (
    <div>
      <PageHeader title="Thư viện của tôi" subtitle="Ảnh đã mua, certificate license và lượt tải còn lại." />
      {sp.error && <div className="mb-4"><Alert kind="error">{decodeURIComponent(sp.error)}</Alert></div>}

      {grants.length === 0 ? (
        <EmptyState
          title="Bạn chưa mua ảnh nào"
          hint="Mua ảnh để tải file gốc và nhận certificate license."
          action={<Link href="/" className="btn-primary mt-2">Khám phá ảnh</Link>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {grants.map((g) => {
            const remaining = Math.max(0, g.maxDownloads - g.downloadCount);
            return (
              <div key={g.id} className="card overflow-hidden">
                <Link href={`/photos/${g.photo.id}`} className="block aspect-[4/3] bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={publicAssetUrl(g.photo.thumbKey)} alt={g.photo.title} className="h-full w-full object-cover" />
                </Link>
                <div className="space-y-2 p-3">
                  <p className="truncate font-medium text-gray-900">{g.photo.title}</p>
                  <p className="text-xs text-gray-500">
                    License: {LICENSE_LABELS[g.licenseType]}
                    {g.source === "SWAP" && <span className="badge ml-1 bg-fuchsia-100 text-fuchsia-700">Swap</span>}
                    {g.source === "SUBSCRIPTION" && <span className="badge ml-1 bg-emerald-100 text-emerald-700">Gói</span>}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-emerald-700">
                    <BadgeCheck className="h-3.5 w-3.5" /> Cert: {g.certNo}
                  </p>
                  <p className="text-xs text-gray-400">Còn {remaining}/{g.maxDownloads} lượt tải</p>
                  <DownloadButton
                    action={requestDownloadAction}
                    fields={{ grantId: g.id }}
                    className="btn-primary w-full"
                    pendingText="Đang tạo link..."
                  >
                    <Download className="h-4 w-4" /> {remaining > 0 ? "Tải file gốc" : "Hết lượt tải"}
                  </DownloadButton>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
