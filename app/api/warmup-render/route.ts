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
      })
    }

    diagnostics.push(`Tentative de réchauffement de l'API Render: ${renderApiUrl}`)
    console.log("Tentative de réchauffement de l'API Render:", renderApiUrl)

    // Envoyer une requête simple pour réveiller l'API
    const pingStartTime = Date.now()
    let response: Response

    try {
      response = await fetch(renderApiUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        // Timeout plus long pour permettre à Render de démarrer
        signal: AbortSignal.timeout(15000),
      })
    } catch (fetchError) {
      const pingDuration = Date.now() - pingStartTime
      diagnostics.push(
        `Erreur lors de la requête (${pingDuration}ms): ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`,
      )

      return NextResponse.json({
        success: false,
        status: "error",
        responseTime: `${pingDuration}ms`,
        message: `Erreur lors de la connexion à l'API Render: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`,
        diagnostics,
      })
    }

    const pingDuration = Date.now() - pingStartTime
    diagnostics.push(`Réponse reçue en ${pingDuration}ms avec statut ${response.status}`)

    let responseText = ""
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

    console.log(`Réponse de l'API Render (${pingDuration}ms):`, response.status, responseText.substring(0, 100))

    // Essayer de parser la réponse JSON si possible
    let jsonResponse = null
    try {
      if (responseText && responseText.trim().startsWith("{")) {
        jsonResponse = JSON.parse(responseText)
        diagnostics.push(`Réponse JSON: ${JSON.stringify(jsonResponse, null, 2)}`)
      }
    } catch (jsonError) {
      diagnostics.push(
        `La réponse n'est pas un JSON valide: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`,
      )
    }

    // Vérifier si l'API est prête en fonction du statut HTTP
    const isReady = response.status >= 200 && response.status < 500
    const statusMessage = isReady ? "active" : "inactive"

    const totalDuration = Date.now() - startTime
    diagnostics.push(`Durée totale: ${totalDuration}ms`)

    return NextResponse.json({
      success: isReady,
      status: response.status,
      statusMessage,
      responseTime: `${pingDuration}ms`,
      totalTime: `${totalDuration}ms`,
      message: isReady
        ? "API Render réchauffée avec succès"
        : `L'API Render a répondu avec un statut ${response.status}`,
      responseBody: responseText.substring(0, 500),
      jsonResponse,
      diagnostics,
    })
  } catch (error) {
    const totalDuration = Date.now() - startTime
    diagnostics.push(`Durée totale jusqu'à l'erreur: ${totalDuration}ms`)
    diagnostics.push(`Erreur lors du réchauffement: ${error instanceof Error ? error.message : String(error)}`)
    console.error("Erreur lors du réchauffement de l'API Render:", error)

    return NextResponse.json({
      success: false,
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      totalTime: `${totalDuration}ms`,
      diagnostics,
    })
  }
}
