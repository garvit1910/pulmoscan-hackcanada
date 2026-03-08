/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@kitware/vtk.js'],
  async rewrites() {
    return [
      {
        source: '/assets/:path*',
        destination: 'http://localhost:8000/assets/:path*',
      },
    ]
  },
};

export default nextConfig;
