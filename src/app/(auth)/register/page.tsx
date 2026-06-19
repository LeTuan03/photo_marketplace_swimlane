import Link from "next/link";
import { registerAction } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert } from "@/components/ui";
import { GoogleButton, OrDivider } from "@/components/GoogleButton";
import { googleConfigured } from "@/lib/google";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="mx-auto mt-6 max-w-md">
      <div className="card p-6">
        <h1 className="mb-1 text-2xl font-bold">Tạo tài khoản</h1>
        <p className="mb-5 text-sm text-gray-500">Mua, bán và trao đổi ảnh trên Picseo.</p>

        {sp.error && (
          <div className="mb-4">
            <Alert kind="error">{sp.error}</Alert>
          </div>
        )}

        {googleConfigured() && (
          <>
            <GoogleButton next={sp.next ?? "/"} label="Đăng ký với Google" />
            <OrDivider />
          </>
        )}

        <form action={registerAction} className="space-y-4">
          <input type="hidden" name="next" value={sp.next ?? "/"} />
          <div>
            <label className="label">Họ tên</label>
            <input name="name" required className="input" placeholder="Nguyễn Văn A" />
          </div>
          <div>
            <label className="label">Email</label>
            <input name="email" type="email" required className="input" placeholder="ban@email.com" />
          </div>
          <div>
            <label className="label">Mật khẩu</label>
            <input name="password" type="password" required minLength={6} className="input" placeholder="Tối thiểu 6 ký tự" />
          </div>
          <div>
            <label className="label">Bạn muốn</label>
            <select name="role" className="input">
              <option value="BUYER">Mua ảnh</option>
              <option value="SELLER">Bán / trao đổi ảnh</option>
            </select>
          </div>
          <SubmitButton className="btn-primary w-full">Đăng ký</SubmitButton>
        </form>

        <p className="mt-4 text-center text-sm text-gray-500">
          Đã có tài khoản?{" "}
          <Link href={`/login${sp.next ? `?next=${encodeURIComponent(sp.next)}` : ""}`} className="font-medium text-brand-600 hover:underline">
            Đăng nhập
          </Link>
        </p>
      </div>
    </div>
  );
}
