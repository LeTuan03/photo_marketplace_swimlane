import { Star } from "lucide-react";

/** Hiển thị sao chỉ đọc theo điểm trung bình (làm tròn gần nhất). */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  const filled = Math.round(value);
  return (
    <span className="inline-flex items-center" aria-label={`${value.toFixed(1)} sao`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          style={{ width: size, height: size }}
          className={i <= filled ? "fill-amber-400 text-amber-400" : "fill-gray-200 text-gray-200"}
        />
      ))}
    </span>
  );
}

export function RatingSummary({ sum, count, size = 16 }: { sum: number; count: number; size?: number }) {
  const avg = count > 0 ? sum / count : 0;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-gray-600">
      <Stars value={avg} size={size} />
      <span>{count > 0 ? `${avg.toFixed(1)} · ${count} đánh giá` : "Chưa có đánh giá"}</span>
    </span>
  );
}
