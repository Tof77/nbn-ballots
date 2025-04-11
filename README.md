# NBN Ballots - Extraction Automatique des votes

Application Next.js pour extraire automatiquement les votes depuis isolutions.iso.org.

## Technologies utilisées

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- Puppeteer pour l'automatisation du navigateur

## Fonctionnalités

- Extraction automatique des votes depuis isolutions.iso.org
- Filtrage par commission et date
- Affichage des résultats dans un tableau interactif
- Recherche et tri des résultats
- Export CSV des résultats
- Chiffrement des identifiants côté client

## Installation

\`\`\`bash
# Installer les dépendances
npm install

# Lancer le serveur de développement
npm run dev
\`\`\`

## Variables d'environnement

Créez un fichier `.env.local` à la racine du projet avec le chemin vers Microsoft Edge:

\`\`\`
EDGE_PATH=C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe
\`\`\`

## Déploiement

Cette application est optimisée pour être déployée sur Vercel.
