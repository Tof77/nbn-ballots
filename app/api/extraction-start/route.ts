import { NextResponse } from "next/server"
import { v4 as uuidv4 } from "uuid"

export const runtime = "nodejs"
export const maxDuration = 30

export async function POST(request: Request) {
  try {
    const data = await request.json()

    // Vérifier que les données nécessaires sont présentes
    if (!data.commissionId || !data.credentials) {
      return NextResponse.json(
        {
          success: false,
          message: "Données incomplètes. Commission et identifiants requis.",
        },
        { status: 400 },
      )
    }

    // Générer un ID d'extraction unique
    const extractionId = `extract-${uuidv4()}`

    // Vérifier si l'URL de l'API Render est configurée
    const renderApiUrl = process.env.RENDER_API_URL

    if (!renderApiUrl) {
      return NextResponse.json(
        {
          success: false,
          message: "L'URL de l'API Render n'est pas configurée.",
          renderApiStatus: "unavailable",
          renderApiMessage: "RENDER_API_URL non définie dans les variables d'environnement",
          extractionId,
        },
        { status: 503 },
      )
    }

    // Retourner l'ID d'extraction pour que le client puisse suivre l'état
    return NextResponse.json({
      success: true,
      message: "Extraction démarrée",
      extractionId,
    })
  } catch (error) {
    console.error("Erreur lors du démarrage de l'extraction:", error)
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
