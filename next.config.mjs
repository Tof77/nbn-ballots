/** @type {import('next').NextConfig} */
const nextConfig = {
  // Configuration simplifiée
  experimental: {
    serverComponentsExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
  },
  // Ajout de la configuration pour le dossier src
  pageExtensions: ['js', 'jsx', 'ts', 'tsx'],
}

export default nextConfig
