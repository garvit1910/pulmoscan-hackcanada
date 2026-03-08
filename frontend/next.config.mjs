/** @type {import('next').NextConfig} */
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@kitware/vtk.js'],
  async rewrites() {
    return [
      {
        source: '/assets/:path*',
        destination: `${API_URL}/assets/:path*`,
      },
    ]
  },
};

export default nextConfig;
