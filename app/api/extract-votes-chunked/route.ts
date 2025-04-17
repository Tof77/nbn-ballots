import { type NextRequest, NextResponse } from "next/server"

// Définir le runtime Node.js pour cette route API
export const runtime = "nodejs"
// Définir la durée maximale d'exécution à 90 secondes
export const maxDuration = 90

// Cette route API permet d'extraire les votes par lots (chunks)
// pour éviter les timeouts lors de l'extraction de grands volumes de données

interface ChunkRequest {
  commissionId: string
  startDate: string
  endDate?: string
  chunkSize: number
  chunkIndex: number
  totalChunks: number
  extractDetails: boolean
  credentials: {
    encryptedUsername: string
    encryptedPassword: string
  }
}

export async function POST(req: NextRequest) {
  const diagnostics: string[] = []
  const startTime = Date.now()

  try {
    // Récupérer les données de la requête
    const requestData: ChunkRequest = await req.json()

    // Valider les données de la requête
    if (!requestData.commissionId || !requestData.startDate || !requestData.credentials) {
      return NextResponse.json(
        {
          error: "Paramètres manquants",
          details: "commissionId, startDate et credentials sont requis",
        },
        { status: 400 },
      )
    }

    // Vérifier que les informations de chunk sont valides
    if (
      requestData.chunkIndex === undefined ||
      requestData.totalChunks === undefined ||
      requestData.chunkSize === undefined ||
      requestData.chunkIndex < 0 ||
      requestData.totalChunks <= 0 ||
      requestData.chunkIndex >= requestData.totalChunks
    ) {
      return NextResponse.json(
        {
          error: "Paramètres de chunk invalides",
          details: "chunkIndex, totalChunks et chunkSize doivent être valides",
        },
        { status: 400 },
      )
    }

    // URL de l'API Render
    const renderApiUrl = process.env.RENDER_API_URL
    if (!renderApiUrl) {
      return NextResponse.json(
        {
          error: "Configuration manquante",
          details: "RENDER_API_URL n'est pas définie",
        },
        { status: 500 },
      )
    }

    // Ajouter les informations de chunk à la requête
    const renderRequestData = {
      ...requestData,
      // Indiquer qu'il s'agit d'une requête par lots
      isChunkedRequest: true,
    }

    // Appeler l'API Render avec un timeout plus court
    try {
      const response = await fetch(`${renderApiUrl}/api/extract-votes-chunked`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
        body: JSON.stringify(renderRequestData),
        signal: AbortSignal.timeout(60000), // 60 secondes de timeout
      })

      // Vérifier si la réponse est OK
      if (!response.ok) {
        const errorText = await response.text()
        return NextResponse.json(
          {
            error: `Erreur de l'API Render: ${response.status} ${response.statusText}`,
            details: errorText,
            diagnostics,
          },
          { status: response.status },
        )
      }

      // Récupérer les données de la réponse
      const responseData = await response.json()

      // Ajouter des informations de diagnostic
      responseData.diagnostics = [
        ...(responseData.diagnostics || []),
        ...diagnostics,
        `Durée totale de traitement: ${Date.now() - startTime}ms`,
        `Chunk ${requestData.chunkIndex + 1}/${requestData.totalChunks} traité avec succès`,
      ]

      return NextResponse.json(responseData)
    } catch (error) {
      // Vérifier si c'est une erreur de timeout
      if (error.name === "AbortError" || error.name === "TimeoutError") {
        return NextResponse.json(
          {
            error: "Timeout lors de l'appel à l'API Render",
            details: `L'API Render a mis trop de temps à répondre pour le chunk ${requestData.chunkIndex + 1}/${requestData.totalChunks}`,
            diagnostics: [
              ...diagnostics,
              `Durée avant timeout: ${Date.now() - startTime}ms`,
              `Chunk ${requestData.chunkIndex + 1}/${requestData.totalChunks} a expiré`,
            ],
          },
          { status: 408 },
        )
      }

      // Autres erreurs
      return NextResponse.json(
        {
          error: "Erreur lors de l'appel à l'API Render",
          details: error instanceof Error ? error.message : String(error),
          diagnostics,
        },
        { status: 500 },
      )
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: "Erreur lors du traitement de la requête",
        details: error instanceof Error ? error.message : String(error),
        diagnostics: [...diagnostics, `Durée totale jusqu'à l'erreur: ${Date.now() - startTime}ms`],
      },
      { status: 500 },
    )
  }
}
