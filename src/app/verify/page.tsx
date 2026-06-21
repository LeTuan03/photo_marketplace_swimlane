import Link from "next/link";
import { ShieldCheck, ShieldX, ShieldAlert, Search, AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { publicAssetUrl } from "@/lib/storage";
import { LICENSE_LABELS, LICENSE_DESCRIPTIONS } from "@/lib/constants";
import { normalizeCertNo, maskName, maskEmail } from "@/lib/utils";
import { LicenseScope } from "@/components/LicenseScope";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader, Alert } from "@/components/ui";
import { reportMisuseAction } from "./actions";

export const dynamic = "force-dynamic";

const sourceLabel: Record<string, string> = {
  PURCHASE: "Mua lẻ",
  SWAP: "Trao đổi (swap)",
  SUBSCRIPTION: "Tải bằng gói subscription",
};

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ cert?: string; reported?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const cert = sp.cert ? normalizeCertNo(sp.cert) : "";
  const viewer = await getCurrentUser();

  const grant = cert
    ? await prisma.downloadGrant.findUnique({
        where: { certNo: cert },
        include: {
          photo: { select: { id: true, title: true, thumbKey: true, status: true } },
          buyer: { select: { name: true, email: true } },
        },
      })
    : null;

  // VALID = còn hiệu lực; REVOKED = đã hoàn tiền/thu hồi (maxDownloads bị về 0 khi refund).
  const revoked = grant ? grant.maxDownloads === 0 : false;
  const photoGone = grant ? grant.photo.status === "REMOVED" || grant.photo.status === "DMCA_HOLD" : false;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Tra cứu license"
        subtitle="Nhập mã chứng nhận (certificate) trên ảnh để kiểm tra ảnh được cấp phép dùng cho mục đích gì, ai đang giữ và còn hiệu lực không."
      />

      <form method="get" className="card mb-5 flex flex-col gap-2 p-4 sm:flex-row">
        <input
          name="cert"
          defaultValue={cert}
          placeholder="VD: PIC-7F3A-9C21"
          className="input flex-1 font-mono uppercase"
          autoFocus
        />
        <SubmitButton className="btn-primary">
          <Search className="h-4 w-4" /> Tra cứu
        </SubmitButton>
      </form>

      {sp.error && <div className="mb-4"><Alert kind="error">{decodeURIComponent(sp.error)}</Alert></div>}
      {sp.reported && (
        <div className="mb-4">
          <Alert kind="success">Đã gửi báo cáo dùng sai phạm vi tới quản trị viên. Cảm ơn bạn!</Alert>
        </div>
      )}

      {!cert ? (
        <div className="card p-5 text-sm text-gray-600">
          <p className="font-medium text-gray-800">Dùng để làm gì?</p>
          <p className="mt-1">
            Mỗi lần mua/nhận ảnh, Picseo cấp một <strong>certificate</strong> kèm mã dạng <code>PIC-XXXX-XXXX</code>.
            Khi thấy một ảnh xuất hiện ở nơi khác (banner quảng cáo, bao bì, bài báo...), bạn nhập mã trên certificate đó
            vào đây để biết người dùng được cấp phép tới đâu. Nếu cách dùng vượt quá phạm vi license, hãy gửi báo cáo —
            quản trị viên sẽ xử lý.
          </p>
        </div>
      ) : !grant ? (
        <div className="card p-6 text-center">
          <ShieldX className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-2 font-medium text-gray-800">Không tìm thấy certificate “{cert}”</p>
          <p className="mt-1 text-sm text-gray-500">
            Mã không tồn tại trong hệ thống Picseo. Ảnh này có thể chưa từng được cấp phép hợp lệ qua Picseo —
            hãy kiểm tra lại mã hoặc coi như chưa có giấy phép.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Trạng thái */}
          {revoked ? (
            <Alert kind="error">
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <ShieldX className="h-4 w-4" /> License đã bị thu hồi / hoàn tiền — không còn hiệu lực.
              </span>
            </Alert>
          ) : (
            <Alert kind="success">
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <ShieldCheck className="h-4 w-4" /> License hợp lệ — được cấp bởi Picseo.
              </span>
            </Alert>
          )}
          {photoGone && !revoked && (
            <Alert kind="info">
              <span className="inline-flex items-center gap-1.5">
                <ShieldAlert className="h-4 w-4" /> Lưu ý: ảnh gốc hiện đã bị gỡ/đang bị khiếu nại trên Picseo.
              </span>
            </Alert>
          )}

          {/* Certificate */}
          <div className="card overflow-hidden">
            <div className="flex flex-col gap-4 p-5 sm:flex-row">
              <Link href={`/photos/${grant.photo.id}`} className="block h-28 w-28 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={publicAssetUrl(grant.photo.thumbKey)} alt={grant.photo.title} className="h-full w-full object-cover" />
              </Link>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900">{grant.photo.title}</p>
                <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                  <div className="flex justify-between gap-2 border-b border-gray-50 py-0.5">
                    <dt className="text-gray-500">Mã chứng nhận</dt>
                    <dd className="font-mono font-medium text-gray-900">{grant.certNo}</dd>
                  </div>
                  <div className="flex justify-between gap-2 border-b border-gray-50 py-0.5">
                    <dt className="text-gray-500">Loại license</dt>
                    <dd className="font-medium text-gray-900">{LICENSE_LABELS[grant.licenseType]}</dd>
                  </div>
                  <div className="flex justify-between gap-2 border-b border-gray-50 py-0.5">
                    <dt className="text-gray-500">Người giữ</dt>
                    <dd className="text-gray-700" title="Đã che một phần để bảo vệ quyền riêng tư">
                      {maskName(grant.buyer.name)} · {maskEmail(grant.buyer.email)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2 border-b border-gray-50 py-0.5">
                    <dt className="text-gray-500">Nguồn</dt>
                    <dd className="text-gray-700">{sourceLabel[grant.source] ?? grant.source}</dd>
                  </div>
                  <div className="flex justify-between gap-2 border-b border-gray-50 py-0.5">
                    <dt className="text-gray-500">Ngày cấp</dt>
                    <dd className="text-gray-700">{new Date(grant.createdAt).toLocaleDateString("vi-VN")}</dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Phạm vi của đúng license này */}
            <div className="border-t border-gray-100 bg-gray-50 p-5">
              <p className="mb-3 text-sm font-semibold text-gray-800">
                Phạm vi của license {LICENSE_LABELS[grant.licenseType]}
              </p>
              <p className="mb-3 text-xs text-gray-500">{LICENSE_DESCRIPTIONS[grant.licenseType]}</p>
              <LicenseScope type={grant.licenseType} />
            </div>
          </div>

          {/* Báo cáo dùng sai */}
          <details className="card p-4">
            <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Ảnh này đang bị dùng SAI phạm vi license?
            </summary>
            {viewer ? (
              <form action={reportMisuseAction} className="mt-3 space-y-2">
                <input type="hidden" name="certNo" value={grant.certNo} />
                <input type="hidden" name="photoId" value={grant.photo.id} />
                <div>
                  <label className="label">Link nơi ảnh đang bị dùng sai</label>
                  <input name="usageUrl" type="url" required placeholder="https://..." className="input" />
                </div>
                <textarea
                  name="detail"
                  rows={2}
                  className="input"
                  placeholder="Mô tả (vd: dùng license Cá nhân để chạy quảng cáo Facebook)"
                />
                <SubmitButton className="btn-danger w-full">Gửi báo cáo cho quản trị viên</SubmitButton>
              </form>
            ) : (
              <p className="mt-3 text-sm text-gray-500">
                Vui lòng{" "}
                <Link href={`/login?next=${encodeURIComponent(`/verify?cert=${grant.certNo}`)}`} className="font-medium text-brand-700 underline">
                  đăng nhập
                </Link>{" "}
                để gửi báo cáo dùng sai phạm vi.
              </p>
            )}
          </details>
        </div>
      )}
    </div>
  );
}
