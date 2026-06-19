// Toàn bộ tiền trong hệ thống lưu bằng số nguyên VND (đồng).

export function formatVnd(amount: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(n);
}

/** Làm tròn xuống đến đồng (không có số lẻ thập phân với VND). */
export function vnd(amount: number): number {
  return Math.max(0, Math.round(amount));
}
