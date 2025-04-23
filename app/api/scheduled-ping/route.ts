import { NextResponse } from "next/server"

// Cette route est conçue pour être appelée par un cron job Vercel
// afin de maintenir l'API Render active
export const runtime = "edge"
export const maxDuration = 10

export async function GET() {
  const startTime = Date.now()
  const logs: string[] = []

  try {
    logs.push(`Ping programmé démarré à ${new Date().toISOString()}`)
    // Ajouter plus de logs pour faciliter le débogage
    const baseUrl = process.env.RENDER_SERVICE_URL || process.env.VERCEL_URL || "http://localhost:3000"
    logs.push(`Utilisation de l'URL de base: ${baseUrl}`)

    // Ajouter un try/catch plus détaillé autour du fetch
    try {
      logs.push(`Tentative d'appel à ${new URL("/api/ping-render", baseUrl).toString()}`)
      const response = await fetch(new URL("/api/ping-render", baseUrl), {
        method: "GET",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      })

      const data = await response.json()
      const duration = Date.now() - startTime

      logs.push(`Ping terminé en ${duration}ms avec statut: ${response.status}`)

      return NextResponse.json({
        success: response.ok,
        timestamp: new Date().toISOString(),
        duration: `${duration}ms`,
        pingResult: data,
        logs,
      })
    } catch (error) {
      const duration = Date.now() - startTime
      logs.push(`Erreur lors de l'appel fetch: ${error instanceof Error ? error.message : String(error)}`)

      return NextResponse.json(
        {
          success: false,
          timestamp: new Date().toISOString(),
          duration: `${duration}ms`,
          error: error instanceof Error ? error.message : String(error),
          logs,
        },
        { status: 500 },
      )
    }
  } catch (error) {
    const duration = Date.now() - startTime
    logs.push(`Erreur lors du ping programmé: ${error instanceof Error ? error.message : String(error)}`)

    return NextResponse.json(
      {
        success: false,
        timestamp: new Date().toISOString(),
        duration: `${duration}ms`,
        error: error instanceof Error ? error.message : String(error),
        logs,
      },
      { status: 500 },
    )
  }
}
