import { NextResponse } from "next/server"

// Cette route permet de "réchauffer" l'API Render avant de l'utiliser
// Les plans gratuits de Render se mettent en veille après une période d'inactivité
export async function GET() {
  const diagnostics: string[] = []
  const startTime = Date.now()

  try {
    const renderApiUrl = process.env.RENDER_API_URL

    if (!renderApiUrl) {
      return NextResponse.json({
        success: false,
        message: "RENDER_API_URL non définie",
        diagnostics,
        status: 500,
      })
    }

    diagnostics.push(`Tentative de réchauffement de l'API Render: ${renderApiUrl}`)
    console.log("Tentative de réchauffement de l'API Render:", renderApiUrl)

    // Envoyer une requête simple pour réveiller l'API
    const pingStartTime = Date.now()
    let response: Response | null = null
    let responseText = ""
    let fetchError: any = null

    try {
      // Ajouter un paramètre de cache-buster pour éviter les réponses en cache
      const timestamp = Date.now()
      const urlWithCacheBuster = `${renderApiUrl}?cache=${timestamp}`

      response = await fetch(urlWithCacheBuster, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
        // Timeout plus long pour permettre à Render de démarrer
        signal: AbortSignal.timeout(30000), // Augmenté à 30 secondes
      })

      const pingDuration = Date.now() - pingStartTime
      diagnostics.push(`Réponse reçue en ${pingDuration}ms avec statut ${response.status}`)

      try {
        responseText = await response.text()
        diagnostics.push(
          `Contenu de la réponse: ${responseText.substring(0, 200)}${responseText.length > 200 ? "..." : ""}`,
        )
      } catch (textError) {
        diagnostics.push(
          `Erreur lors de la lecture du corps de la réponse: ${textError instanceof Error ? textError.message : String(textError)}`,
        )
      }
    } catch (error) {
      fetchError = error
      const pingDuration = Date.now() - pingStartTime
      diagnostics.push(
        `Erreur lors de la requête (${pingDuration}ms): ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    // Si nous avons une erreur de timeout ou une erreur 502/504, c'est probablement que Render est en train de démarrer
    if (fetchError || (response && (response.status === 504 || response.status === 502))) {
      const errorMessage = fetchError
        ? `Erreur de connexion: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`
        : response?.status === 502
          ? "Erreur 502 Bad Gateway: Le serveur Render est probablement en cours de démarrage ou surchargé"
          : "Erreur 504 Gateway Timeout: Le serveur Render est probablement en cours de démarrage"

      diagnostics.push(errorMessage)
      console.log(errorMessage)

      // Ajouter des informations de débogage supplémentaires pour l'erreur 502
      let debugInfo = {}
      if (response?.status === 502) {
        debugInfo = {
          headers: Object.fromEntries(response.headers.entries()),
          url: response.url,
          redirected: response.redirected,
          type: response.type,
          responseTextSample: responseText.substring(0, 500),
        }
        diagnostics.push(`Informations de débogage pour l'erreur 502: ${JSON.stringify(debugInfo, null, 2)}`)
      }

      return NextResponse.json({
        success: false,
        status: response?.status || 0,
        statusMessage: "starting",
        responseTime: `${Date.now() - pingStartTime}ms`,
        totalTime: `${Date.now() - startTime}ms`,
        message:
          "L'API Render est en cours de démarrage ou rencontre des problèmes. Veuillez réessayer dans 30-60 secondes.",
        error: errorMessage,
        diagnostics,
        debugInfo,
      })
    }

    if (!response) {
      return NextResponse.json({
        success: false,
        status: "error",
        statusMessage: "error",
        message: "Erreur inconnue lors de la connexion à l'API Render",
        diagnostics,
      })
    }

    console.log(`Réponse de l'API Render:`, response.status, responseText.substring(0, 100))

    // Essayer de parser la réponse JSON si possible
    let jsonResponse = null
    try {
      if (responseText && responseText.trim().startsWith("{")) {
        jsonResponse = JSON.parse(responseText)
        diagnostics.push(`Réponse JSON: ${JSON.stringify(jsonResponse, null, 2)}`)
      } else {
        // Si la réponse n'est pas un JSON, vérifier si c'est une page HTML
        const isHtml = responseText.includes("<!DOCTYPE html>") || responseText.includes("<html")
        if (isHtml) {
          diagnostics.push("La réponse est une page HTML, pas un JSON. L'API est probablement en cours de démarrage.")
        } else {
          diagnostics.push(`La réponse n'est pas un JSON valide: ${responseText.substring(0, 100)}...`)
        }
      }
    } catch (jsonError) {
      diagnostics.push(
        `La réponse n'est pas un JSON valide: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`,
      )
    }

    // Vérifier si l'API est prête en fonction du statut HTTP
    let isReady = false
    let statusMessage = "inactive"

    if (response.status >= 200 && response.status < 300) {
      isReady = true
      statusMessage = "active"
    } else if (response.status === 502) {
      // 502 Bad Gateway - Render est probablement en train de démarrer ou surchargé
      isReady = false
      statusMessage = "starting"
      diagnostics.push("Erreur 502 Bad Gateway: Le serveur Render est probablement en cours de démarrage ou surchargé")
    } else if (response.status === 504) {
      // 504 Gateway Timeout - Render est probablement en train de démarrer
      isReady = false
      statusMessage = "starting"
      diagnostics.push("Erreur 504 Gateway Timeout: Le serveur Render est probablement en cours de démarrage")
    } else if (response.status >= 500) {
      isReady = false
      statusMessage = "error"
    } else {
      // Pour les codes 300-499, vérifier si la réponse contient un message d'erreur spécifique
      isReady = false
      statusMessage = "starting"

      // Si la réponse contient "Application is starting", c'est un bon signe
      if (responseText.includes("Application is starting") || responseText.includes("Please wait")) {
        statusMessage = "starting"
        diagnostics.push("L'application Render est en cours de démarrage.")
      }
    }

    const totalDuration = Date.now() - startTime
    diagnostics.push(`Durée totale: ${totalDuration}ms`)

    return NextResponse.json({
      success: isReady,
      status: response.status,
      statusMessage,
      responseTime: `${Date.now() - pingStartTime}ms`,
      totalTime: `${totalDuration}ms`,
      message: isReady
        ? "API Render réchauffée avec succès"
        : statusMessage === "starting"
          ? "L'API Render est en cours de démarrage, veuillez réessayer dans 30-60 secondes"
          : `L'API Render a répondu avec un statut ${response.status}`,
      responseBody: responseText.substring(0, 500),
      jsonResponse,
      diagnostics,
      headers: Object.fromEntries(response.headers.entries()),
    })
  } catch (error) {
    const totalDuration = Date.now() - startTime
    diagnostics.push(`Durée totale jusqu'à l'erreur: ${totalDuration}ms`)
    diagnostics.push(`Erreur lors du réchauffement: ${error instanceof Error ? error.message : String(error)}`)
    console.error("Erreur lors du réchauffement de l'API Render:", error)

    return NextResponse.json({
      success: false,
      status: "error",
      statusMessage: "error",
      message: error instanceof Error ? error.message : String(error),
      totalTime: `${totalDuration}ms`,
      diagnostics,
    })
  }
}
