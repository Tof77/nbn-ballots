// app/api/index.ts
// Ce fichier force l'inclusion de tous les endpoints API
import './extract-votes/route'
import './extract-votes-edge/route'
import './test/route'
// Ajoutez d'autres imports si nécessaire

export default function ApiIndex() {
  // Ce fichier n'a pas besoin de contenu réel
  return null
}
