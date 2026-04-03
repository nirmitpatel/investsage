/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath: '/investsage',
  assetPrefix: '/investsage/',
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig
