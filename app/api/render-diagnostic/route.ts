import { NextResponse } from "next/server"

export const runtime = "edge"
export const maxDuration = 30

// Fonction pour tester un endpoint
async function testEndpoint(url: string): Promise<{
  path: string
  url: string
  status?: number
  statusText?: string
  ok?: boolean
  responseBody?: string
  error?: string
}> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
      signal: AbortSignal.timeout(5000), // 5 secondes
    })

    let responseBody = ""
    try {
      // Essayer de lire le corps de la réponse
      responseBody = await response.text()
      responseBody = responseBody.substring(0, 200) // Limiter la taille
    } catch (e) {
      responseBody = `Erreur lors de la lecture du corps: ${e instanceof Error ? e.message : String(e)}`
    }

    return {
      path: new URL(url).pathname,
      url,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      responseBody,
    }
  } catch (error) {
    return {
      path: new URL(url).pathname,
      url,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function GET() {
  const diagnostics: any[] = []
  const startTime = Date.now()

  try {
    const renderApiUrl = process.env.RENDER_API_URL
    if (!renderApiUrl) {
      return NextResponse.json({
        success: false,
        message: "RENDER_API_URL n'est pas défini",
        timestamp: new Date().toISOString(),
      })
    }

    // Tester différents chemins d'API
    const pathsToTest = ["/", "/ping", "/api/ping", "/api/extract-votes", "/api/extract-votes-stream", "/screenshots"]

    // Tester tous les endpoints en parallèle
    const testResults = await Promise.all(
      pathsToTest.map((path) => {
        const fullUrl = `${renderApiUrl}${path}`
        console.log(`Test de l'endpoint: ${fullUrl}`)
        return testEndpoint(fullUrl)
      }),
    )

    // Ajouter les résultats au diagnostic
    diagnostics.push(...testResults)

    // Vérifier les variables d'environnement
    const envVars = {
      RENDER_API_URL: process.env.RENDER_API_URL || "non défini",
      RENDER_SERVICE_URL: process.env.RENDER_SERVICE_URL || "non défini",
      RENDER_SERVICE_NAME: process.env.RENDER_SERVICE_NAME || "non défini",
      RENDER_BASE_URL: process.env.RENDER_BASE_URL || "non défini",
      VERCEL_URL: process.env.VERCEL_URL || "non défini",
      VERCEL_CALLBACK_URL: process.env.VERCEL_CALLBACK_URL || "non défini",
      RENDER_CALLBACK_URL: process.env.RENDER_CALLBACK_URL || "non défini",
    }

    return NextResponse.json({
      success: true,
      diagnostics,
      envVars,
      totalTime: `${Date.now() - startTime}ms`,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      diagnostics,
      totalTime: `${Date.now() - startTime}ms`,
      timestamp: new Date().toISOString(),
    })
  }
}
