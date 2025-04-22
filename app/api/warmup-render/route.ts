import { NextResponse } from "next/server"

export const runtime = "edge"
export const maxDuration = 60 // Augmenter à 60 secondes

export async function GET(req: Request) {
  const startTime = Date.now()
  const diagnostics: string[] = []

  try {
    // Récupérer l'URL de l'API Render depuis les variables d'environnement
    const renderApiUrl = process.env.RENDER_API_URL

    if (!renderApiUrl) {
      return NextResponse.json({
        success: false,
        statusMessage: "missing-config",
        message: "RENDER_API_URL non définie",
        diagnostics,
        timestamp: new Date().toISOString(),
      })
    }

    diagnostics.push(`Envoi d'un ping à l'API Render: ${renderApiUrl}`)
    console.log("Envoi d'un ping à l'API Render:", renderApiUrl)

    // Ajouter un paramètre de cache-buster pour éviter les réponses en cache
    const timestamp = Date.now()
    const urlWithCacheBuster = `${renderApiUrl}/ping?cache=${timestamp}`

    // Envoyer une requête simple pour réveiller l'API
    const pingStartTime = Date.now()
    let response: Response | null = null

    try {
      response = await fetch(urlWithCacheBuster, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
        // Augmenter le timeout pour le ping
        signal: AbortSignal.timeout(30000), // 30 secondes
      })

      const pingDuration = Date.now() - pingStartTime
      diagnostics.push(`Réponse reçue en ${pingDuration}ms avec statut ${response.status}`)
      console.log(`Réponse reçue en ${pingDuration}ms avec statut ${response.status}`)

      // Récupérer le corps de la réponse
      const responseText = await response.text()
      console.log("Réponse du ping:", responseText)

      // Vérifier si le service est en cours de démarrage (statut 503 ou message spécifique)
      if (response.status === 503) {
        return NextResponse.json({
          success: false,
          statusMessage: "starting",
          message: "L'API Render est en cours de démarrage ou en maintenance",
          status: response.status,
          responseTime: `${pingDuration}ms`,
          totalTime: `${Date.now() - startTime}ms`,
          responseBody: responseText.substring(0, 200),
          diagnostics,
          timestamp: new Date().toISOString(),
        })
      }

      // Si la réponse est OK, l'API est prête
      if (response.ok) {
        return NextResponse.json({
          success: true,
          statusMessage: "active",
          message: "API Render réchauffée avec succès",
          status: response.status,
          responseTime: `${pingDuration}ms`,
          totalTime: `${Date.now() - startTime}ms`,
          responseBody: responseText.substring(0, 200),
          diagnostics,
          timestamp: new Date().toISOString(),
        })
      } else {
        // Si la réponse n'est pas OK, il y a un problème avec l'API
        return NextResponse.json({
          success: false,
          statusMessage: "error",
          message: `Erreur lors du réchauffement: ${response.statusText}`,
          status: response.status,
          responseTime: `${pingDuration}ms`,
          totalTime: `${Date.now() - startTime}ms`,
          responseBody: responseText.substring(0, 200),
          diagnostics,
          timestamp: new Date().toISOString(),
        })
      }
    } catch (error: any) {
      const pingDuration = Date.now() - pingStartTime
      const isTimeoutError = error.name === "TimeoutError" || error.name === "AbortError"

      diagnostics.push(
        `Erreur lors du ping (${pingDuration}ms): ${error instanceof Error ? error.message : String(error)}`,
      )
      console.error("Erreur lors du ping:", error)

      return NextResponse.json({
        success: false,
        statusMessage: isTimeoutError ? "starting" : "error",
        message: isTimeoutError
          ? "L'API Render est probablement en cours de démarrage (timeout)"
          : `Erreur lors du ping: ${error instanceof Error ? error.message : String(error)}`,
        responseTime: `${pingDuration}ms`,
        totalTime: `${Date.now() - startTime}ms`,
        diagnostics,
        timestamp: new Date().toISOString(),
      })
    }
  } catch (error: any) {
    const totalDuration = Date.now() - startTime
    diagnostics.push(`Durée totale jusqu'à l'erreur: ${totalDuration}ms`)
    diagnostics.push(`Erreur lors du réchauffement: ${error instanceof Error ? error.message : String(error)}`)
    console.error("Erreur lors du réchauffement:", error)

    return NextResponse.json({
      success: false,
      statusMessage: "error",
      message: error instanceof Error ? error.message : String(error),
      totalTime: `${totalDuration}ms`,
      diagnostics,
      timestamp: new Date().toISOString(),
    })
  }
}
