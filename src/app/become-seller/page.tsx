import { becomeSellerAction } from "@/app/(auth)/actions";
import { getCurrentUser } from "@/lib/auth";
import { SubmitButton } from "@/components/SubmitButton";
import { redirect } from "next/navigation";

export default async function BecomeSellerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/become-seller");
  if (user.role === "SELLER" || user.role === "ADMIN") redirect("/seller");

  return (
    <div className="mx-auto mt-6 max-w-lg">
      <div className="card p-6">
        <h1 className="text-2xl font-bold">Trở thành người bán</h1>
        <p className="mt-2 text-sm text-gray-600">
          Đăng ký kênh bán để upload và kiếm tiền từ ảnh của bạn. Sau khi đăng ký, bạn cần xác minh danh tính (KYC)
          để có thể rút tiền. Hoa hồng nền tảng áp dụng theo tier (mới: 30%, Pro: 20%, Elite: 10%).
        </p>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-gray-600">
          <li>Upload ảnh JPG/PNG, tối đa 50MB mỗi ảnh</li>
          <li>Đặt giá theo từng loại license</li>
          <li>Tiền bán được giữ trong escrow 7 ngày rồi giải ngân</li>
        </ul>
        <form action={becomeSellerAction} className="mt-6">
          <SubmitButton className="btn-primary w-full">Đăng ký làm người bán</SubmitButton>
        </form>
      </div>
    </div>
  );
}
