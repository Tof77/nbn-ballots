import { type NextRequest, NextResponse } from "next/server"

// Définir le runtime Node.js pour cette route API
export const runtime = "nodejs"

export async function GET(req: NextRequest): Promise<Response> {
  try {
    // Récupérer toutes les variables d'environnement liées à Render et Vercel
    const envVars = {
      RENDER_API_URL: process.env.RENDER_API_URL || null,
      RENDER_BASE_URL: process.env.RENDER_BASE_URL || null,
      RENDER_SERVICE_URL: process.env.RENDER_SERVICE_URL || null,
      RENDER_SERVICE_NAME: process.env.RENDER_SERVICE_NAME || null,
      RENDER_CALLBACK_URL: process.env.RENDER_CALLBACK_URL || null,
      VERCEL_URL: process.env.VERCEL_URL || null,
      VERCEL_CALLBACK_URL: process.env.VERCEL_CALLBACK_URL || null,
      NODE_ENV: process.env.NODE_ENV || null,
    }

    // Construire les URLs complètes pour les endpoints importants
    const extractionEndpoints = [
      process.env.RENDER_API_URL ? `${process.env.RENDER_API_URL}/extract-votes` : null,
      process.env.RENDER_API_URL ? `${process.env.RENDER_API_URL}/api/extract-votes` : null,
      process.env.RENDER_BASE_URL ? `${process.env.RENDER_BASE_URL}/extract-votes` : null,
      process.env.RENDER_BASE_URL ? `${process.env.RENDER_BASE_URL}/api/extract-votes` : null,
    ].filter(Boolean)

    const callbackEndpoints = [
      process.env.VERCEL_CALLBACK_URL || null,
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/api/extraction-stream` : null,
      "https://nbn-ballots.vercel.app/api/extraction-stream",
    ].filter(Boolean)

    // Retourner les informations
    return NextResponse.json({
      envVars,
      extractionEndpoints,
      callbackEndpoints,
      diagnosticTools: {
        renderEndpoints: "/api/render-endpoints",
        renderTest: "/api/render-test?endpoint=/api/extract-votes&method=POST",
        renderDiagnostic: "/api/render-diagnostic",
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Erreur lors de la récupération des informations:", error)
    return NextResponse.json(
      {
        error: `Erreur lors de la récupération des informations: ${error instanceof Error ? error.message : String(error)}`,
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    )
  }
}
