/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Spécifier explicitement que c'est une application Next.js
  experimental: {
    appDir: true,
  },
  // Configuration pour les fonctions serverless
  serverRuntimeConfig: {
    // Sera disponible uniquement côté serveur
    EDGE_PATH: process.env.EDGE_PATH,
  },
  publicRuntimeConfig: {
    // Sera disponible côté client et serveur
    APP_ENV: process.env.NODE_ENV,
  },
}

export default nextConfig
