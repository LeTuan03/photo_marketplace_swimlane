import { Check, X } from "lucide-react";
import { LICENSE_SCOPE } from "@/lib/constants";
import type { LicenseType } from "@prisma/client";

/** Bảng "được phép / không được phép" cho một license — dùng ở chi tiết ảnh, thanh toán, /verify. */
export function LicenseScope({ type }: { type: LicenseType }) {
  const scope = LICENSE_SCOPE[type];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700">Được phép dùng cho</p>
        <ul className="space-y-1">
          {scope.allowed.map((s) => (
            <li key={s} className="flex items-start gap-1.5 text-xs text-gray-600">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" /> <span>{s}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-red-700">KHÔNG được dùng cho</p>
        <ul className="space-y-1">
          {scope.forbidden.map((s) => (
            <li key={s} className="flex items-start gap-1.5 text-xs text-gray-600">
              <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" /> <span>{s}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
