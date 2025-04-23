import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 30

export async function GET(request: Request) {
  try {
    // Récupérer l'URL de l'API Render depuis les variables d'environnement
    const renderApiUrl = process.env.RENDER_API_URL

    if (!renderApiUrl) {
      return NextResponse.json({
        success: false,
        status: "unavailable",
        statusMessage: "unavailable",
        message: "L'URL de l'API Render n'est pas configurée (RENDER_API_URL manquante)",
      })
    }

    // Ajouter un paramètre de cache-buster pour éviter les réponses en cache
    const timestamp = new Date().getTime()
    const pingUrl = `${renderApiUrl}/ping?cache=${timestamp}`

    console.log(`Ping de l'API Render: ${pingUrl}`)

    // Définir un timeout pour la requête
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000) // 15 secondes

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

      // Vérifier si le service est en maintenance (503)
      if (response.status === 503) {
        return NextResponse.json({
          success: false,
          status: "maintenance",
          statusMessage: "maintenance",
          message: "L'API Render est en maintenance (503)",
          statusCode: response.status,
        })
      }

      // Vérifier si le service est en cours de démarrage (502)
      if (response.status === 502) {
        return NextResponse.json({
          success: false,
          status: "starting",
          statusMessage: "starting",
          message: "L'API Render est en cours de démarrage (502)",
          statusCode: response.status,
        })
      }

      // Vérifier si la réponse est OK
      if (!response.ok) {
        return NextResponse.json({
          success: false,
          status: "error",
          statusMessage: "error",
          message: `L'API Render a répondu avec un statut ${response.status}`,
          statusCode: response.status,
        })
      }

      // Lire le corps de la réponse
      const responseText = await response.text()
      let responseData

      try {
        responseData = JSON.parse(responseText)
      } catch (error) {
        return NextResponse.json({
          success: false,
          status: "error",
          statusMessage: "error",
          message: "La réponse de l'API Render n'est pas un JSON valide",
          responseText: responseText.substring(0, 200),
          statusCode: response.status,
        })
      }

      // Vérifier si la réponse contient un statut "pong"
      if (responseData.status === "pong") {
        return NextResponse.json({
          success: true,
          status: "active",
          statusMessage: "active",
          message: "L'API Render est active et répond correctement",
          timestamp: responseData.timestamp,
          statusCode: response.status,
        })
      } else {
        return NextResponse.json({
          success: false,
          status: "inactive",
          statusMessage: "inactive",
          message: "L'API Render a répondu mais le format est incorrect",
          responseData,
          statusCode: response.status,
        })
      }
    } catch (error) {
      // Nettoyer le timeout en cas d'erreur
      clearTimeout(timeoutId)

      // Vérifier si c'est une erreur d'abandon (timeout)
      if (error.name === "AbortError") {
        return NextResponse.json({
          success: false,
          status: "timeout",
          statusMessage: "timeout",
          message: "Timeout lors de la connexion à l'API Render",
        })
      }

      return NextResponse.json({
        success: false,
        status: "error",
        statusMessage: "error",
        message: `Erreur lors de la connexion à l'API Render: ${error.message}`,
      })
    }
  } catch (error) {
    console.error("Erreur lors du réchauffement de l'API Render:", error)
    return NextResponse.json(
      {
        success: false,
        status: "error",
        statusMessage: "error",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
