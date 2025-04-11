import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  // Désactivons temporairement la redirection pour déboguer
  // Si la requête est pour l'API d'extraction des votes, nous la laissons passer directement

  // Commentons cette partie pour le débogage
  /*
  if (request.nextUrl.pathname === "/api/extract-votes") {
    // Rediriger vers la bonne implémentation en fonction de l'environnement
    if (process.env.VERCEL === "1") {
      // Sur Vercel, utiliser l'implémentation Edge
      const url = request.nextUrl.clone()
      url.pathname = "/api/extract-votes-edge"
      return NextResponse.rewrite(url)
    }
  }
  */

  return NextResponse.next()
}

// Configurer le middleware pour s'exécuter uniquement sur les chemins d'API spécifiques
export const config = {
  matcher: ["/api/extract-votes"],
}
