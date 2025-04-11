FROM ghcr.io/puppeteer/puppeteer:latest

# Définir le répertoire de travail
WORKDIR /app

# Copier les fichiers package.json et package-lock.json
COPY package.json ./

# Installer les dépendances
RUN npm install

# Copier le reste des fichiers de l'application
COPY . .

# Exposer le port sur lequel l'application s'exécutera
EXPOSE 3000

# Démarrer l'application
CMD ["node", "server.js"]
