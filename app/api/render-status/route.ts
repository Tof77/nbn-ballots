import { NextResponse } from "next/server"

export const runtime = "edge"
export const maxDuration = 30

// Fonction pour tester un endpoint
async function testEndpoint(url: string): Promise<{
  success: boolean
  status?: number
  statusText?: string
  responseData?: any
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

    if (response.ok) {
      let responseData
      try {
        responseData = await response.json()
      } catch (e) {
        responseData = { text: await response.text() }
      }

      return {
        success: true,
        status: response.status,
        statusText: response.statusText,
        responseData,
      }
    }

    return {
      success: false,
      status: response.status,
      statusText: response.statusText,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function GET() {
  try {
    const renderApiUrl = process.env.RENDER_API_URL

    if (!renderApiUrl) {
      return NextResponse.json({
        success: false,
        status: "unknown",
        message: "RENDER_API_URL n'est pas défini",
        timestamp: new Date().toISOString(),
      })
    }

    // Tester différents chemins d'API pour trouver celui qui fonctionne
    const pathsToTest = ["/", "/ping"]

    // Tester tous les endpoints en parallèle
    const results = await Promise.all(pathsToTest.map((path) => testEndpoint(`${renderApiUrl}${path}`)))

    // Trouver le premier test réussi
    const successfulTest = results.find((result) => result.success)

    if (successfulTest) {
      return NextResponse.json({
        success: true,
        status: "active",
        message: "API Render active",
        responseData: successfulTest.responseData,
        timestamp: new Date().toISOString(),
      })
    }

    // Si aucun chemin n'a fonctionné
    return NextResponse.json({
      success: false,
      status: "inactive",
      message: "API Render inactive ou inaccessible",
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    })
  }
}
