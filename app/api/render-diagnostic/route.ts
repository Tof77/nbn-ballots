import { type NextRequest, NextResponse } from "next/server"

// Définir le runtime Node.js pour cette route API
export const runtime = "nodejs"

export async function GET(req: NextRequest): Promise<Response> {
  try {
    // Récupérer les variables d'environnement liées à Render
    const renderApiUrl = process.env.RENDER_API_URL || null
    const renderBaseUrl = process.env.RENDER_BASE_URL || null
    const renderServiceUrl = process.env.RENDER_SERVICE_URL || null
    const renderServiceName = process.env.RENDER_SERVICE_NAME || null
    const vercelUrl = process.env.VERCEL_URL || null
    const vercelCallbackUrl = process.env.VERCEL_CALLBACK_URL || null
    const renderCallbackUrl = process.env.RENDER_CALLBACK_URL || null

    // Construire les URLs potentielles
    const potentialUrls = []

    if (renderApiUrl) {
      potentialUrls.push({
        name: "RENDER_API_URL",
        url: renderApiUrl,
        extractionUrl: `${renderApiUrl}/extract-votes`,
      })
    }

    if (renderBaseUrl) {
      potentialUrls.push({
        name: "RENDER_BASE_URL",
        url: renderBaseUrl,
        extractionUrl: `${renderBaseUrl}/extract-votes`,
      })
    }

    if (renderServiceUrl) {
      potentialUrls.push({
        name: "RENDER_SERVICE_URL",
        url: renderServiceUrl,
        extractionUrl: `${renderServiceUrl}/extract-votes`,
      })
    }

    // Construire les URLs de callback potentielles
    const potentialCallbackUrls = []

    if (vercelCallbackUrl) {
      potentialCallbackUrls.push({
        name: "VERCEL_CALLBACK_URL",
        url: vercelCallbackUrl,
      })
    }

    if (renderCallbackUrl) {
      potentialCallbackUrls.push({
        name: "RENDER_CALLBACK_URL",
        url: renderCallbackUrl,
      })
    }

    if (vercelUrl) {
      potentialCallbackUrls.push({
        name: "VERCEL_URL (construit)",
        url: `https://${vercelUrl}/api/extraction-stream`,
      })
    } else {
      potentialCallbackUrls.push({
        name: "Fallback local",
        url: "http://localhost:3000/api/extraction-stream",
      })
    }

    // Tester chaque URL potentielle
    const urlResults = await Promise.all(
      potentialUrls.map(async (urlInfo) => {
        try {
          // Tester l'URL de base avec un simple ping
          const pingUrl = `${urlInfo.url}/ping`
          console.log(`Tentative de ping sur: ${pingUrl}`)

          const pingResponse = await fetch(pingUrl, {
            method: "GET",
            headers: {
              "Cache-Control": "no-cache, no-store, must-revalidate",
              Pragma: "no-cache",
              Expires: "0",
            },
            cache: "no-store",
          }).catch((error) => {
            console.error(`Erreur lors du ping de ${pingUrl}:`, error)
            return { ok: false, status: 0, statusText: error.message }
          })

          // Récupérer le texte de la réponse si possible
          let pingResponseText = ""
          try {
            if (pingResponse.text) {
              pingResponseText = await pingResponse.text()
            }
          } catch (error) {
            console.error(`Erreur lors de la lecture de la réponse de ${pingUrl}:`, error)
          }

          return {
            name: urlInfo.name,
            url: urlInfo.url,
            extractionUrl: urlInfo.extractionUrl,
            pingUrl,
            pingStatus: pingResponse.status,
            pingOk: pingResponse.ok,
            pingStatusText: pingResponse.statusText,
            pingResponseText: pingResponseText.substring(0, 200) + (pingResponseText.length > 200 ? "..." : ""),
          }
        } catch (error) {
          console.error(`Erreur lors du test de ${urlInfo.url}:`, error)
          return {
            name: urlInfo.name,
            url: urlInfo.url,
            extractionUrl: urlInfo.extractionUrl,
            error: error.message,
          }
        }
      }),
    )

    // Retourner les résultats
    return NextResponse.json({
      renderApiUrl,
      renderBaseUrl,
      renderServiceUrl,
      renderServiceName,
      vercelUrl,
      vercelCallbackUrl,
      renderCallbackUrl,
      potentialUrls,
      potentialCallbackUrls,
      urlResults,
    })
  } catch (error) {
    console.error("Erreur lors du diagnostic Render:", error)
    return NextResponse.json(
      {
        error: `Erreur lors du diagnostic Render: ${error.message}`,
        details: error.stack,
      },
      { status: 500 },
    )
  }
}
