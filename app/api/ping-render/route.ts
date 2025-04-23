import { NextResponse } from "next/server"

// Cette route permet d'envoyer des pings périodiques à l'API Render
// pour éviter qu'elle ne se mette en veille après une période d'inactivité
export const runtime = "edge"
export const maxDuration = 30

export async function GET() {
  console.log("Démarrage de l'API ping-render à", new Date().toISOString())
  const diagnostics: string[] = []
  const startTime = Date.now()

  try {
    // Appel à l'API Render
    const renderApiUrl = process.env.RENDER_API_URL
    if (!renderApiUrl) {
      console.log("RENDER_API_URL n'est pas défini")
      return NextResponse.json(
        {
          success: false,
          message: "RENDER_API_URL n'est pas défini",
          timestamp: new Date().toISOString(),
        },
        { status: 500 },
      )
    }

    console.log("Tentative d'appel à", renderApiUrl)

    diagnostics.push(`Envoi d'un ping à l'API Render: ${renderApiUrl}`)
    console.log("Envoi d'un ping à l'API Render:", renderApiUrl)

    // Envoyer une requête simple pour réveiller l'API
    const pingStartTime = Date.now()
    let response: Response | null = null

    try {
      // Ajouter un paramètre de cache-buster pour éviter les réponses en cache
      const timestamp = Date.now()
      const urlWithCacheBuster = `${renderApiUrl}/ping?cache=${timestamp}`

      response = await fetch(urlWithCacheBuster, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
        // Timeout court pour le ping
        signal: AbortSignal.timeout(20000), // 20 secondes
      })

      const pingDuration = Date.now() - pingStartTime
      diagnostics.push(`Réponse reçue en ${pingDuration}ms avec statut ${response.status}`)

      // Récupérer le corps de la réponse
      const responseText = await response.text()

      return NextResponse.json({
        success: response.ok,
        status: response.status,
        message: response.ok ? "Ping réussi" : `Erreur: ${response.statusText}`,
        responseTime: `${pingDuration}ms`,
        totalTime: `${Date.now() - startTime}ms`,
        responseBody: responseText.substring(0, 200),
        diagnostics,
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      const pingDuration = Date.now() - pingStartTime
      diagnostics.push(
        `Erreur lors du ping (${pingDuration}ms): ${error instanceof Error ? error.message : String(error)}`,
      )

      return NextResponse.json({
        success: false,
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        responseTime: `${pingDuration}ms`,
        totalTime: `${Date.now() - startTime}ms`,
        diagnostics,
        timestamp: new Date().toISOString(),
      })
    }
  } catch (error) {
    console.error("Erreur lors du ping Render:", error)
    const totalDuration = Date.now() - startTime
    diagnostics.push(`Durée totale jusqu'à l'erreur: ${totalDuration}ms`)
    diagnostics.push(`Erreur lors du ping: ${error instanceof Error ? error.message : String(error)}`)

    return NextResponse.json(
      {
        success: false,
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        totalTime: `${totalDuration}ms`,
        diagnostics,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}
