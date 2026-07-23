/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // Lint runs as its own CI step; keep a lint error from failing the deploy build.
  eslint: {
    ignoreDuringBuilds: true,
  },
}

export default nextConfig
