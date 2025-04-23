import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 10

// Fonction pour tenter un ping sur une URL spécifique
async function attemptPing(url: string, label: string) {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 secondes

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
      signal: controller.signal,
    })

    // Nettoyer le timeout
    clearTimeout(timeoutId)

    // Lire le corps de la réponse
    const responseText = await response.text()

    console.log(`Ping ${label} - Statut: ${response.status}`)

    return {
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      responseText: responseText.substring(0, 200),
      url: url,
    }
  } catch (error) {
    console.error(`Erreur lors du ping ${label}:`, error)
    return {
      success: false,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
      url: url,
    }
  }
}

export async function GET(request: Request) {
  try {
    // Récupérer l'URL de l'API Render depuis les variables d'environnement
    const renderApiUrl = process.env.RENDER_API_URL

    if (!renderApiUrl) {
      return NextResponse.json({
        success: false,
        message: "L'URL de l'API Render n'est pas configurée (RENDER_API_URL manquante)",
      })
    }

    // Modifier la fonction pour essayer différentes routes de ping
    const pingUrl = `${renderApiUrl}/ping`
    const alternatePingUrl = `${renderApiUrl}/api/ping`
    const rootUrl = renderApiUrl

    console.log(`Tentative de ping sur plusieurs URLs:
1. ${pingUrl}
2. ${alternatePingUrl}
3. ${rootUrl}`)

    // Tenter les pings sur toutes les URLs
    const results = await Promise.all([
      attemptPing(pingUrl, "URL standard"),
      attemptPing(alternatePingUrl, "URL alternative"),
      attemptPing(rootUrl, "URL racine"),
    ])

    // Trouver le premier ping réussi
    const successfulPing = results.find((result) => result.success)

    if (successfulPing) {
      return NextResponse.json({
        success: true,
        status: successfulPing.status,
        statusText: successfulPing.statusText,
        responseText: successfulPing.responseText,
        timestamp: new Date().toISOString(),
        message: `API Render disponible via ${successfulPing.url}`,
        statusMessage: "active",
        allResults: results,
      })
    } else {
      // Aucun ping n'a réussi
      return NextResponse.json({
        success: false,
        status: "inactive",
        timestamp: new Date().toISOString(),
        message: "API Render non disponible sur toutes les URLs testées",
        statusMessage: "inactive",
        allResults: results,
      })
    }
  } catch (error) {
    console.error("Erreur lors du ping de l'API Render:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}
