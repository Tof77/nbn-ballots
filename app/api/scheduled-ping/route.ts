import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 10

// Fonction pour effectuer un ping avec timeout
async function pingWithTimeout(
  url: string,
  timeout = 5000,
): Promise<{
  success: boolean
  status?: number
  statusText?: string
  responseText?: string
  error?: string
}> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    const responseText = await response.text()

    return {
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      responseText: responseText.substring(0, 200),
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function GET(request: Request) {
  try {
    // Récupérer l'URL de l'API Render depuis les variables d'environnement
    const renderApiUrl = process.env.RENDER_API_URL

    if (!renderApiUrl) {
      return NextResponse.json({
        success: false,
        message: "L'URL de l'API Render n'est pas configurée (RENDER_API_URL manquante)",
      })
    }

    // Ajouter un paramètre de cache-buster pour éviter les réponses en cache
    const timestamp = new Date().getTime()
    const pingUrl = `${renderApiUrl}/ping?cache=${timestamp}`

    console.log(`Ping programmé de l'API Render: ${pingUrl}`)

    // Effectuer le ping avec timeout
    const pingResult = await pingWithTimeout(pingUrl)

    if (pingResult.success) {
      return NextResponse.json({
        success: true,
        status: pingResult.status,
        statusText: pingResult.statusText,
        responseText: pingResult.responseText,
        timestamp: new Date().toISOString(),
      })
    } else {
      return NextResponse.json({
        success: false,
        error: pingResult.error || "Échec du ping",
        timestamp: new Date().toISOString(),
      })
    }
  } catch (error) {
    console.error("Erreur lors du ping programmé de l'API Render:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}
