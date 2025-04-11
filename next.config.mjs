/** @type {import('next').NextConfig} */
const nextConfig = {
  // Configuration pour les fonctions Edge
  experimental: {
    serverComponentsExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
  },
  // Configuration pour les variables d'environnement
  env: {
    RENDER_API_URL: process.env.RENDER_API_URL,
  },
}

export default nextConfig
