/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    domains: ['localhost', 'images.unsplash.com'],
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '7860',
        pathname: '/sdapi/**',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  env: {
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
    SD_WEBUI_URL: process.env.SD_WEBUI_URL,
  },
}

module.exports = nextConfig
