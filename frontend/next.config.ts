import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  output: 'standalone',
  reactStrictMode: false,

  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    proxyTimeout: 300000, // 5 minutes
  },
  turbopack: {},
  webpack: (config, { isServer }) => {
    config.watchOptions = {
      ignored: [
        '**/node_modules/**',
        '**/backend/**',
        '**/db/**',
        '**/data/**',
        '**/temp/**',
      ],
    };
    return config;
  },
  async rewrites() {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    return [
      {
        source: `${basePath}/api/:path*`,
        destination: 'http://127.0.0.1:8000/api/:path*',
        basePath: false,
      },
      {
        source: `${basePath}/docs`,
        destination: 'http://127.0.0.1:8000/docs',
        basePath: false,
      },
      {
        source: `${basePath}/openapi.json`,
        destination: 'http://127.0.0.1:8000/openapi.json',
        basePath: false,
      },
    ];
  },
};

export default nextConfig;
