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
  // Cho phép body lớn khi upload ảnh qua Server Actions
  experimental: {
    serverActions: {
      bodySizeLimit: "55mb",
    },
  },
};

export default nextConfig;
