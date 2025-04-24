import { type NextRequest, NextResponse } from "next/server"

// Définir le runtime Node.js pour cette route API
export const runtime = "nodejs"

export async function GET(req: NextRequest): Promise<Response> {
  try {
    // Récupérer l'URL de base de l'API Render
    const renderApiUrl = process.env.RENDER_API_URL || "https://nbn-ballots-api.onrender.com"

    // Tester les deux endpoints possibles
    const endpoints = ["/extract-votes", "/api/extract-votes"]

    const results = await Promise.all(
      endpoints.map(async (endpoint) => {
        const fullUrl = `${renderApiUrl}${endpoint}`
        try {
          // Tester avec OPTIONS pour voir les méthodes supportées
          const response = await fetch(fullUrl, {
            method: "OPTIONS",
            headers: {
              "Cache-Control": "no-cache",
            },
          }).catch((error) => {
            return {
              ok: false,
              status: 0,
              statusText: error instanceof Error ? error.message : String(error),
            }
          })

          return {
            endpoint,
            fullUrl,
            status: response.status,
            ok: response.ok,
            statusText: response.statusText,
          }
        } catch (error) {
          return {
            endpoint,
            fullUrl,
            error: error instanceof Error ? error.message : String(error),
          }
        }
      }),
    )

    // Retourner les résultats
    return NextResponse.json({
      renderApiUrl,
      results,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Erreur lors du test:", error)
    return NextResponse.json(
      {
        error: `Erreur lors du test: ${error instanceof Error ? error.message : String(error)}`,
      },
      { status: 500 },
    )
  }
}
