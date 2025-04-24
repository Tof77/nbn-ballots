import { type NextRequest, NextResponse } from "next/server"

// Définir le runtime Node.js pour cette route API
export const runtime = "nodejs"

export async function GET(req: NextRequest): Promise<Response> {
  try {
    // Récupérer l'URL de base de l'API Render
    const renderApiUrl = process.env.RENDER_API_URL || "https://nbn-ballots-api.onrender.com"

    // Récupérer l'endpoint à tester depuis les paramètres de requête
    const { searchParams } = new URL(req.url)
    const endpoint = searchParams.get("endpoint") || "/api/extract-votes"
    const method = (searchParams.get("method") || "GET").toUpperCase()

    // Construire l'URL complète
    const fullUrl = `${renderApiUrl}${endpoint}`
    console.log(`Test de l'endpoint ${method} ${fullUrl}`)

    // Préparer les options de la requête
    const options: RequestInit = {
      method,
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
      cache: "no-store",
    }

    // Ajouter un corps pour les requêtes POST
    if (method === "POST") {
      options.headers = {
        ...options.headers,
        "Content-Type": "application/json",
      }
      options.body = JSON.stringify({
        test: true,
        timestamp: new Date().toISOString(),
      })
    }

    // Effectuer la requête
    const response = await fetch(fullUrl, options).catch((error) => {
      console.error(`Erreur lors de la requête ${method} ${fullUrl}:`, error)
      return {
        ok: false,
        status: 0,
        statusText: error instanceof Error ? error.message : String(error),
        headers: new Headers(),
      }
    })

    // Récupérer les headers
    const headers: Record<string, string> = {}
    if (response.headers) {
      response.headers.forEach((value, key) => {
        headers[key] = value
      })
    }

    // Récupérer le corps de la réponse
    let responseBody = ""
    let responseJson = null

    try {
      if ("text" in response && typeof response.text === "function") {
        responseBody = await response.text()

        // Essayer de parser comme JSON
        try {
          if (responseBody.trim().startsWith("{") || responseBody.trim().startsWith("[")) {
            responseJson = JSON.parse(responseBody)
          }
        } catch (parseError) {
          console.error("Impossible de parser la réponse comme JSON:", parseError)
        }
      }
    } catch (error) {
      console.error(`Erreur lors de la lecture de la réponse de ${fullUrl}:`, error)
      responseBody = `Erreur lors de la lecture de la réponse: ${error instanceof Error ? error.message : String(error)}`
    }

    // Retourner les résultats
    return NextResponse.json({
      url: fullUrl,
      method,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers,
      responseBody: responseBody.substring(0, 1000) + (responseBody.length > 1000 ? "..." : ""),
      responseJson,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Erreur lors du test de l'endpoint:", error)
    return NextResponse.json(
      {
        error: `Erreur lors du test de l'endpoint: ${error instanceof Error ? error.message : String(error)}`,
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    )
  }
}
