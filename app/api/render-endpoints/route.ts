import { type NextRequest, NextResponse } from "next/server"

// Définir le runtime Node.js pour cette route API
export const runtime = "nodejs"

// Liste des endpoints potentiels à tester
const POTENTIAL_ENDPOINTS = [
  "/extract-votes",
  "/api/extract-votes",
  "/extraction",
  "/api/extraction",
  "/ballot-extraction",
  "/api/ballot-extraction",
  "/ballots",
  "/api/ballots",
  "/votes",
  "/api/votes",
]

export async function GET(req: NextRequest): Promise<Response> {
  try {
    // Récupérer l'URL de base de l'API Render
    const renderApiUrl = process.env.RENDER_API_URL || "https://nbn-ballots-api.onrender.com"

    // Tester chaque endpoint potentiel
    const results = await Promise.all(
      POTENTIAL_ENDPOINTS.map(async (endpoint) => {
        const fullUrl = `${renderApiUrl}${endpoint}`
        console.log(`Tentative de connexion à: ${fullUrl}`)

        try {
          // Tester avec GET pour voir si l'endpoint existe
          const getResponse = await fetch(fullUrl, {
            method: "GET",
            headers: {
              "Cache-Control": "no-cache, no-store, must-revalidate",
              Pragma: "no-cache",
              Expires: "0",
            },
            cache: "no-store",
          }).catch((error) => {
            return {
              ok: false,
              status: 0,
              statusText: error instanceof Error ? error.message : String(error),
            }
          })

          // Tester avec OPTIONS pour voir les méthodes supportées
          const optionsResponse = await fetch(fullUrl, {
            method: "OPTIONS",
            headers: {
              "Cache-Control": "no-cache, no-store, must-revalidate",
              Pragma: "no-cache",
              Expires: "0",
            },
            cache: "no-store",
          }).catch((error) => {
            return {
              ok: false,
              status: 0,
              statusText: error instanceof Error ? error.message : String(error),
            }
          })

          // Récupérer les headers pour voir les méthodes supportées
          const allowHeader = optionsResponse.headers?.get("allow") || ""
          const corsHeader = optionsResponse.headers?.get("access-control-allow-methods") || ""

          return {
            endpoint,
            fullUrl,
            getStatus: getResponse.status,
            getOk: getResponse.ok,
            optionsStatus: optionsResponse.status,
            optionsOk: optionsResponse.ok,
            allowedMethods: allowHeader || corsHeader || "Non spécifié",
            supportsPOST: allowHeader.includes("POST") || corsHeader.includes("POST") || false,
          }
        } catch (error) {
          console.error(`Erreur lors du test de ${fullUrl}:`, error)
          return {
            endpoint,
            fullUrl,
            error: error instanceof Error ? error.message : String(error),
          }
        }
      }),
    )

    // Vérifier également les endpoints de base
    const baseEndpoints = await Promise.all(
      ["/", "/api", "/ping", "/api/ping", "/health", "/api/health"].map(async (endpoint) => {
        const fullUrl = `${renderApiUrl}${endpoint}`
        try {
          const response = await fetch(fullUrl, {
            method: "GET",
            headers: {
              "Cache-Control": "no-cache, no-store, must-revalidate",
              Pragma: "no-cache",
              Expires: "0",
            },
            cache: "no-store",
          }).catch((error) => {
            return {
              ok: false,
              status: 0,
              statusText: error instanceof Error ? error.message : String(error),
            }
          })

          // Récupérer le texte de la réponse si possible
          let responseText = ""
          try {
            if ("text" in response && typeof response.text === "function") {
              responseText = await response.text()
            }
          } catch (error) {
            console.error(`Erreur lors de la lecture de la réponse de ${fullUrl}:`, error)
          }

          return {
            endpoint,
            fullUrl,
            status: response.status,
            ok: response.ok,
            responseText: responseText.substring(0, 200) + (responseText.length > 200 ? "..." : ""),
          }
        } catch (error) {
          return {
            endpoint,
            fullUrl,
            error: error instanceof Error ? error.message : String(error),
          }
        }
      }),
    )

    // Retourner les résultats
    return NextResponse.json({
      renderApiUrl,
      results,
      baseEndpoints,
      recommendations: [
        "Vérifiez que le service Render est en cours d'exécution",
        "Vérifiez que l'endpoint d'extraction est correctement configuré sur le service Render",
        "Assurez-vous que l'API Render accepte les requêtes POST sur l'endpoint d'extraction",
        "Vérifiez les logs du service Render pour plus d'informations",
      ],
    })
  } catch (error) {
    console.error("Erreur lors de la détection des endpoints:", error)
    return NextResponse.json(
      {
        error: `Erreur lors de la détection des endpoints: ${error instanceof Error ? error.message : String(error)}`,
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    )
  }
}
