/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  async redirects() {
    return [{
      source: "/dept/nevolabs/:path*",
      destination: "/dept/espadalabs/:path*",
      permanent: true,
    }];
  },
  // In dev, proxy /api to local backend. In production (Docker), nginx routes /api,
  // so this rewrite only applies when running `next dev` locally.
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/api/:path*",
      },
    ];
  },
};
module.exports = nextConfig;
