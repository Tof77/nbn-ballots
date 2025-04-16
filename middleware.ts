import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  // Si nous sommes en production (sur Vercel), utiliser l'implémentation Edge
  // Sinon, utiliser l'implémentation Node.js pour le développement local
  if (request.nextUrl.pathname === "/api/extract-votes") {
    if (process.env.VERCEL === "1") {
      console.log("Middleware: Redirection vers l'API Edge en production")
      const url = request.nextUrl.clone()
      url.pathname = "/api/extract-votes-edge"
      return NextResponse.rewrite(url)
    } else {
      console.log("Middleware: Utilisation de l'API Node.js en développement")
    }
  }

  return NextResponse.next()
}

// Configurer le middleware pour s'exécuter uniquement sur les chemins d'API spécifiques
export const config = {
  matcher: ["/api/extract-votes"],
}
