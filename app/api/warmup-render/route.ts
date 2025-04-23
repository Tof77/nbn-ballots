import { type NextRequest, NextResponse } from "next/server"

// Cette API est utilisée pour réchauffer le service Render
// Render met le service en sommeil après une période d'inactivité
// Cette API permet de réveiller le service avant de l'utiliser
export const runtime = "nodejs" // Utiliser NodeJS au lieu de Edge pour éviter les problèmes de CORS

const RENDER_SERVICE_URL =
  process.env.RENDER_SERVICE_URL || process.env.RENDER_API_URL || "https://nbn-ballots-render.onrender.com"
const RENDER_PING_TIMEOUT = 20000 // 20 secondes

// Fonction pour envoyer une requête ping au service Render avec un timeout
async function pingRenderService(timeout = RENDER_PING_TIMEOUT): Promise<{
  success: boolean
  status: number
  statusMessage?: string
  message: string
  rawResponse?: string
}> {
  try {
    // Créer un contrôleur d'abandon pour gérer le timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    // Construire l'URL ping
    const renderApiUrl = RENDER_SERVICE_URL
    const pingUrl = `${renderApiUrl}/ping`
    // Ajouter une URL alternative au cas où la première échoue
    const alternatePingUrl = `${renderApiUrl}/api/ping`

    // Modifier la partie qui effectue la requête fetch pour essayer les deux URLs:
    try {
      console.log(`Tentative de ping sur: ${pingUrl}`)
      const response = await fetch(pingUrl, {
        method: "GET",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
        signal: controller.signal,
        cache: "no-store",
      })

      // Nettoyer le timeout
      clearTimeout(timeoutId)

      // Si la première URL échoue avec un 404, essayer l'URL alternative
      if (response.status === 404) {
        console.log(`Ping échoué (404), tentative avec l'URL alternative: ${alternatePingUrl}`)

        // Réinitialiser le timeout pour la seconde tentative
        const alternateController = new AbortController()
        const alternateTimeoutId = setTimeout(() => alternateController.abort(), 5000)

        try {
          const alternateResponse = await fetch(alternatePingUrl, {
            method: "GET",
            headers: {
              "Cache-Control": "no-cache, no-store, must-revalidate",
              Pragma: "no-cache",
              Expires: "0",
            },
            signal: alternateController.signal,
            cache: "no-store",
          })

          // Nettoyer le timeout
          clearTimeout(alternateTimeoutId)

          // Lire le corps de la réponse alternative
          const alternateResponseText = await alternateResponse.text()

          return {
            success: alternateResponse.ok,
            status: alternateResponse.status,
            statusMessage: alternateResponse.statusText,
            message: alternateResponse.ok
              ? "API Render disponible (URL alternative)"
              : `API Render non disponible (${alternateResponse.status} ${alternateResponse.statusText})`,
            rawResponse: alternateResponseText,
          }
        } catch (alternateError) {
          // Nettoyer le timeout en cas d'erreur
          clearTimeout(alternateTimeoutId)

          console.error("Erreur lors du ping alternatif:", alternateError)
          return {
            success: false,
            status: 0,
            statusMessage: "error",
            message: `Erreur lors du ping alternatif: ${alternateError instanceof Error ? alternateError.message : String(alternateError)}`,
          }
        }
      }

      // Lire le corps de la réponse originale
      let responseText = ""
      try {
        responseText = await response.text()
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        console.error(`Erreur lors de la lecture de la réponse: ${errorMessage}`)
        return {
          success: false,
          status: response.status,
          statusMessage: "error",
          message: `Erreur lors de la lecture de la réponse: ${errorMessage}`,
        }
      }

      // Tenter de parser la réponse JSON
      let responseData
      let isJson = false
      try {
        responseData = JSON.parse(responseText)
        isJson = true
      } catch (err) {
        console.log("La réponse n'est pas un JSON valide:", responseText)
        responseData = null
      }

      // Vérifier le statut de la réponse
      if (response.ok) {
        // Si la réponse est un JSON valide et contient un statut
        if (isJson && responseData && responseData.status) {
          return {
            success: true,
            status: response.status,
            statusMessage: responseData.status,
            message: responseData.message || "API Render disponible",
            rawResponse: responseText,
          }
        }

        // Sinon, retourner simplement que l'API est disponible
        return {
          success: true,
          status: response.status,
          statusMessage: "active",
          message: "API Render disponible",
          rawResponse: responseText,
        }
      } else {
        // Si la réponse est un code d'erreur 503, c'est probablement une maintenance
        if (response.status === 503) {
          return {
            success: false,
            status: response.status,
            statusMessage: "maintenance",
            message: "API Render en maintenance",
            rawResponse: responseText,
          }
        }

        // Pour les autres erreurs, essayer d'extraire les informations du JSON si possible
        if (isJson && responseData && responseData.error) {
          return {
            success: false,
            status: response.status,
            statusMessage: "error",
            message: responseData.error,
            rawResponse: responseText,
          }
        }

        // Fallback pour les erreurs non-JSON
        return {
          success: false,
          status: response.status,
          statusMessage: "error",
          message: `API Render non disponible (${response.status} ${response.statusText})`,
          rawResponse: responseText,
        }
      }
    } catch (error: unknown) {
      // Nettoyer le timeout en cas d'erreur
      clearTimeout(timeoutId)

      // Vérifier si c'est une erreur d'abandon (timeout)
      if (error instanceof Error && error.name === "AbortError") {
        return {
          success: false,
          status: 408, // Request Timeout
          statusMessage: "timeout",
          message: "L'API Render n'a pas répondu dans le délai imparti",
        }
      }

      // Pour les autres erreurs
      console.error("Erreur lors du ping:", error)

      return {
        success: false,
        status: 0,
        statusMessage: "error",
        message: error instanceof Error ? error.message : String(error),
      }
    }
  } catch (error: unknown) {
    // Vérifier si c'est une erreur d'abandon (timeout)
    if (error instanceof Error && error.name === "AbortError") {
      return {
        success: false,
        status: 408, // Request Timeout
        statusMessage: "timeout",
        message: "L'API Render n'a pas répondu dans le délai imparti",
      }
    }

    // Pour les autres erreurs
    console.error("Erreur lors du ping:", error)

    return {
      success: false,
      status: 0,
      statusMessage: "error",
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

// Endpoint GET pour réchauffer le service Render
export async function GET(req: NextRequest) {
  try {
    // Utiliser un plus long timeout ici pour donner à Render le temps de démarrer (20 secondes)
    const pingResult = await pingRenderService(RENDER_PING_TIMEOUT)

    // Vérifier si l'API est en train de démarrer (basé sur la réponse)
    if (pingResult.rawResponse && pingResult.rawResponse.includes("starting")) {
      return NextResponse.json({
        success: false,
        status: pingResult.status,
        statusMessage: "starting",
        message: "L'API Render est en cours de démarrage, veuillez réessayer dans 30-60 secondes",
      })
    }

    // Si l'API est up and running, retourner un succès
    if (pingResult.success) {
      return NextResponse.json({
        success: true,
        status: pingResult.status,
        statusMessage: pingResult.statusMessage || "active",
        message: "API Render disponible et prête à être utilisée",
        serviceUrl: RENDER_SERVICE_URL,
      })
    }

    // Si l'API est en maintenance (code 503)
    if (pingResult.status === 503) {
      return NextResponse.json({
        success: false,
        status: pingResult.status,
        statusMessage: "maintenance",
        message: "Le service Render est en maintenance ou temporairement indisponible",
        serviceUrl: RENDER_SERVICE_URL,
      })
    }

    // Si le ping a échoué, retourner un message d'erreur
    return NextResponse.json({
      success: false,
      status: pingResult.status,
      statusMessage: pingResult.statusMessage || "error",
      message: pingResult.message || "Impossible de contacter l'API Render",
      error: "Le service Render n'est pas disponible",
      serviceUrl: RENDER_SERVICE_URL,
    })
  } catch (error: unknown) {
    console.error("Erreur lors du réchauffement du service Render:", error)

    return NextResponse.json({
      success: false,
      status: 500,
      statusMessage: "error",
      message: "Erreur interne lors du réchauffement du service Render",
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
