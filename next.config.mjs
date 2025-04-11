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
  // Ajout de la configuration pour le dossier src
  pageExtensions: ['js', 'jsx', 'ts', 'tsx'],
}

export default nextConfig
