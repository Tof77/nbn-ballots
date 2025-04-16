import { NextResponse } from "next/server"

// Cette route permet de "réchauffer" l'API Render avant de l'utiliser
// Les plans gratuits de Render se mettent en veille après une période d'inactivité
export async function GET() {
  try {
    const renderApiUrl = process.env.RENDER_API_URL

    if (!renderApiUrl) {
      return NextResponse.json({
        success: false,
        message: "RENDER_API_URL non définie",
      })
    }

    console.log("Tentative de réchauffement de l'API Render:", renderApiUrl)

    // Envoyer une requête simple pour réveiller l'API
    const startTime = Date.now()
    const response = await fetch(renderApiUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      // Timeout plus long pour permettre à Render de démarrer
      signal: AbortSignal.timeout(15000),
    })

    const responseTime = Date.now() - startTime
    const responseText = await response.text()

    console.log(`Réponse de l'API Render (${responseTime}ms):`, response.status, responseText.substring(0, 100))

    return NextResponse.json({
      success: true,
      status: response.status,
      responseTime: `${responseTime}ms`,
      message: "API Render réchauffée avec succès",
    })
  } catch (error) {
    console.error("Erreur lors du réchauffement de l'API Render:", error)
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
