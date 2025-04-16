/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
  },
  pageExtensions: ['js', 'jsx', 'ts', 'tsx'],
  // Forcer l'inclusion de tous les dossiers API
  output: 'standalone',
  outputFileTracing: true,
  outputFileTracingRoot: './',
  outputFileTracingExcludes: {
    '*': [
      'node_modules/@swc/core-linux-x64-gnu',
      'node_modules/@swc/core-linux-x64-musl',
      'node_modules/@esbuild/linux-x64',
    ],
  },
  outputFileTracingIncludes: {
    '*': ['app/api/**/*'],
  },
}

export default nextConfig
