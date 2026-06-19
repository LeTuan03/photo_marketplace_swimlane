export function GoogleButton({ next = "/", label = "Tiếp tục với Google" }: { next?: string; label?: string }) {
  const href = `/api/auth/google?next=${encodeURIComponent(next)}`;
  return (
    <a
      href={href}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
    >
      <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.5 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.3-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.5 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 43.5c5.4 0 10.3-2.1 14-5.4l-6.5-5.5c-2 1.5-4.6 2.4-7.5 2.4-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.6 39 16.2 43.5 24 43.5z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.6l6.5 5.5C41.4 36.4 43.5 30.7 43.5 24c0-1.2-.1-2.3-.4-3.5z" />
      </svg>
      {label}
    </a>
  );
}

export function OrDivider() {
  return (
    <div className="my-4 flex items-center gap-3 text-xs text-gray-400">
      <span className="h-px flex-1 bg-gray-200" />
      hoặc
      <span className="h-px flex-1 bg-gray-200" />
    </div>
  );
}
