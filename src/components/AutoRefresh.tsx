"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Tự làm mới dữ liệu server component theo chu kỳ (router.refresh, không reload trang).
 * Dùng ở trang kết quả thanh toán khi đơn còn PENDING — chờ webhook xác nhận.
 */
export function AutoRefresh({ seconds = 3 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
