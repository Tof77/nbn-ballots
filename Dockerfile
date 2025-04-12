FROM ghcr.io/puppeteer/puppeteer:latest

# 1. Définir le répertoire de travail
WORKDIR /app

# 2. Copier uniquement les fichiers nécessaires pour l'API
COPY server.js ./
COPY api-package.json ./package.json

# 3. Installer les dépendances de l'API
RUN npm install

# 4. Exposer le port sur lequel l'application s'exécutera
EXPOSE 3000

# 5. Démarrer l'application
CMD ["node", "server.js"]
