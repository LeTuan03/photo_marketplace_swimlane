// Tiện ích thuần (dùng được ở cả server component lẫn client).

export function ratingAvg(sum: number, count: number): number {
  return count > 0 ? sum / count : 0;
}

export function formatRating(sum: number, count: number): string {
  if (count === 0) return "Chưa có đánh giá";
  return `${ratingAvg(sum, count).toFixed(1)} (${count})`;
}
