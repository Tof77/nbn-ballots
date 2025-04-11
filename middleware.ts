import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  // Vérifier si la requête est pour l'API d'extraction des votes
  if (request.nextUrl.pathname === "/api/extract-votes") {
    // Rediriger vers la bonne implémentation en fonction de l'environnement
    if (process.env.VERCEL === "1") {
      // Sur Vercel, utiliser l'implémentation Edge
      const url = request.nextUrl.clone()
      url.pathname = "/api/extract-votes-edge"
      return NextResponse.rewrite(url)
    }
  }

  return NextResponse.next()
}

// Configurer le middleware pour s'exécuter uniquement sur les chemins d'API spécifiques
export const config = {
  matcher: ["/api/extract-votes"],
}
