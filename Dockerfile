FROM ghcr.io/puppeteer/puppeteer:latest

# Définir le répertoire de travail
WORKDIR /app

# Copier uniquement les fichiers nécessaires pour l'API
COPY server.js ./
COPY api-package.json ./package.json

# Installer les dépendances de l'API
RUN npm install

# Exposer le port sur lequel l'application s'exécutera
EXPOSE 3000

# Démarrer l'application
CMD ["node", "server.js"]
