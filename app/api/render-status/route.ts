import { NextResponse } from "next/server"

export const runtime = "edge"
export const maxDuration = 30

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

    for (const path of pathsToTest) {
      try {
        const response = await fetch(`${renderApiUrl}${path}`, {
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

          return NextResponse.json({
            success: true,
            status: "active",
            message: "API Render active",
            path: path,
            responseData,
            timestamp: new Date().toISOString(),
          })
        }
      } catch (error) {
        // Continuer avec le chemin suivant
      }
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
