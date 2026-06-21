import Link from "next/link";
import { redirect } from "next/navigation";
import { requestSellerAction } from "@/app/(auth)/actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function BecomeSellerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/become-seller");
  if (user.role === "SELLER" || user.role === "ADMIN") redirect("/seller");

  const last = await prisma.sellerApplication.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  const pending = last?.status === "PENDING";
  const rejected = last?.status === "REJECTED";

  return (
    <div className="mx-auto mt-6 max-w-lg">
      <div className="card p-6">
        <h1 className="text-2xl font-bold">Trở thành người bán</h1>

        {pending ? (
          <>
            <div className="mt-4">
              <Alert kind="info">
                Yêu cầu mở kênh bán của bạn đang chờ quản trị viên duyệt. Bạn sẽ nhận thông báo khi có kết quả.
              </Alert>
            </div>
            <Link href="/" className="btn-outline mt-4 inline-block">Về trang chủ</Link>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-gray-600">
              Gửi yêu cầu mở kênh bán để upload và kiếm tiền từ ảnh của bạn. Yêu cầu cần được quản trị viên
              duyệt; sau đó bạn cần xác minh danh tính (KYC) để rút tiền. Hoa hồng nền tảng áp theo hạng
              (Mới 30% · Pro 20% · Elite 10%).
            </p>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-gray-600">
              <li>Upload ảnh JPG/PNG/WebP, tối đa 50MB mỗi ảnh</li>
              <li>Đặt giá theo từng loại license</li>
              <li>Tiền bán được giữ trong escrow 7 ngày rồi giải ngân</li>
            </ul>
            {rejected && (
              <div className="mt-4">
                <Alert kind="error">
                  Yêu cầu trước đã bị từ chối{last?.reviewNote ? `: ${last.reviewNote}` : "."} Bạn có thể gửi lại.
                </Alert>
              </div>
            )}
            <form action={requestSellerAction} className="mt-6 space-y-3">
              <div>
                <label className="label">Giới thiệu ngắn (tuỳ chọn)</label>
                <textarea
                  name="pitch"
                  rows={3}
                  maxLength={1000}
                  className="input"
                  placeholder="Bạn chụp/thiết kế thể loại ảnh gì? Vì sao muốn mở kênh bán?"
                />
              </div>
              <SubmitButton className="btn-primary w-full">{rejected ? "Gửi lại yêu cầu" : "Gửi yêu cầu mở kênh bán"}</SubmitButton>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
