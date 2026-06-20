/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["sharp", "@aws-sdk/client-s3"],
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost" },
      { protocol: "https", hostname: "**" },
    ],
  },
  // Cho phép body lớn khi upload ảnh qua Server Actions. Đây là giới hạn TỔNG của cả
  // request (cả batch), không phải mỗi ảnh — Next chặn ở tầng framework trước khi action
  // chạy, nên không báo lỗi mềm được. Đặt đủ cho 1 batch ảnh thực tế (~100MB tổng).
  experimental: {
    serverActions: {
      bodySizeLimit: "110mb",
    },
  },
};

export default nextConfig;
