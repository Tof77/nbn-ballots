import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 10

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

    // Ajouter un paramètre de cache-buster pour éviter les réponses en cache
    const timestamp = new Date().getTime()
    const pingUrl = `${renderApiUrl}/ping?cache=${timestamp}`

    console.log(`Ping programmé de l'API Render: ${pingUrl}`)

    // Définir un timeout pour la requête
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 secondes

    try {
      const response = await fetch(pingUrl, {
        method: "GET",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
        signal: controller.signal,
      })

      // Nettoyer le timeout
      clearTimeout(timeoutId)

      // Lire le corps de la réponse
      const responseText = await response.text()

      return NextResponse.json({
        success: true,
        status: response.status,
        statusText: response.statusText,
        responseText: responseText.substring(0, 200),
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      // Nettoyer le timeout en cas d'erreur
      clearTimeout(timeoutId)

      return NextResponse.json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      })
    }
  } catch (error) {
    console.error("Erreur lors du ping programmé de l'API Render:", error)
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
