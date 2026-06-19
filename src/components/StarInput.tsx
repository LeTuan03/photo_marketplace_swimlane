"use client";
import { useState } from "react";
import { Star } from "lucide-react";

export function StarInput({ name = "rating", defaultValue = 5 }: { name?: string; defaultValue?: number }) {
  const [value, setValue] = useState(defaultValue);
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex items-center gap-1">
      <input type="hidden" name={name} value={value} />
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => setValue(i)}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(0)}
          className="p-0.5"
          aria-label={`${i} sao`}
        >
          <Star className={`h-6 w-6 ${i <= shown ? "fill-amber-400 text-amber-400" : "fill-gray-200 text-gray-300"}`} />
        </button>
      ))}
    </div>
  );
}
