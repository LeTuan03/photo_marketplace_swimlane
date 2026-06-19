import Link from "next/link";
import { loginAction } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert } from "@/components/ui";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; email?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="mx-auto mt-6 max-w-md">
      <div className="card p-6">
        <h1 className="mb-1 text-2xl font-bold">Đăng nhập</h1>
        <p className="mb-5 text-sm text-gray-500">Chào mừng quay lại Picseo.</p>

        {sp.error && (
          <div className="mb-4">
            <Alert kind="error">{sp.error}</Alert>
          </div>
        )}

        <form action={loginAction} className="space-y-4">
          <input type="hidden" name="next" value={sp.next ?? "/"} />
          <div>
            <label className="label">Email</label>
            <input name="email" type="email" required defaultValue={sp.email ?? ""} className="input" placeholder="ban@email.com" />
          </div>
          <div>
            <label className="label">Mật khẩu</label>
            <input name="password" type="password" required className="input" placeholder="••••••••" />
          </div>
          <SubmitButton className="btn-primary w-full">Đăng nhập</SubmitButton>
        </form>

        <p className="mt-4 text-center text-sm text-gray-500">
          Chưa có tài khoản?{" "}
          <Link href={`/register${sp.next ? `?next=${encodeURIComponent(sp.next)}` : ""}`} className="font-medium text-brand-600 hover:underline">
            Đăng ký
          </Link>
        </p>

        <div className="mt-5 rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
          <p className="font-medium text-gray-600">Tài khoản demo (mật khẩu: password123):</p>
          <p>admin@picseo.local · seller@picseo.local · buyer@picseo.local</p>
        </div>
      </div>
    </div>
  );
}
