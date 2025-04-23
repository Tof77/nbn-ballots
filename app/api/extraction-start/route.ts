import { type NextRequest, NextResponse } from "next/server"
import crypto from "crypto"

// Définir le runtime Node.js pour cette route API
export const runtime = "nodejs"
// Définir la durée maximale d'exécution à 60 secondes
export const maxDuration = 60

// Fonction pour générer un ID unique
function generateExtractionId(): string {
  return `extract-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`
}

// Fonction pour générer un jeton simple
function generateToken(extractionId: string): string {
  // Dans une implémentation réelle, vous utiliseriez une bibliothèque comme jsonwebtoken
  // Pour l'instant, utilisons une méthode simple
  return Buffer.from(`${extractionId}:${Date.now()}:secret-key`).toString("base64")
}

export async function POST(req: NextRequest) {
  try {
    const requestData = await req.json()
    console.log("Démarrage de l'extraction avec les paramètres:", {
      ...requestData,
      credentials: requestData.credentials ? "***HIDDEN***" : undefined,
    })

    // Valider les données requises
    if (!requestData.commissionId || !requestData.startDate || !requestData.credentials) {
      return NextResponse.json(
        { error: "Paramètres manquants (commissionId, startDate, credentials)" },
        { status: 400 },
      )
    }

    // Générer un ID d'extraction unique
    const extractionId = generateExtractionId()
    console.log(`ID d'extraction généré: ${extractionId}`)

    // Pour une extraction réelle, essayer d'appeler l'API Render
    const renderApiUrl = process.env.RENDER_API_URL
    console.log(`URL de l'API Render: ${renderApiUrl || "non définie"}`)

    if (!renderApiUrl) {
      console.log("RENDER_API_URL non définie, impossible de continuer")
      return NextResponse.json(
        {
          error: "Configuration du serveur incomplète: URL de l'API Render non définie",
          message: "Veuillez contacter l'administrateur système pour configurer l'API Render",
        },
        { status: 500 },
      )
    }

    try {
      // Tester si l'API Render est accessible
      console.log(`Ping de l'API Render: ${renderApiUrl}/ping`)
      const pingResponse = await fetch(`${renderApiUrl}/ping`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
        signal: AbortSignal.timeout(10000), // 10 secondes
      })

      console.log(`Réponse du ping: ${pingResponse.status} ${pingResponse.statusText}`)

      if (!pingResponse.ok) {
        console.log(`L'API Render a répondu avec un statut ${pingResponse.status}, erreur`)
        return NextResponse.json(
          {
            error: `Le serveur d'extraction n'est pas disponible (statut: ${pingResponse.status})`,
            message:
              "Le serveur d'extraction est actuellement indisponible. Veuillez réessayer plus tard ou contacter l'administrateur système.",
          },
          { status: 503 },
        )
      }

      // Appeler l'API Render pour démarrer l'extraction
      console.log(`Appel de l'API Render pour l'extraction: ${renderApiUrl}/api/extract-votes`)

      // Préparer les données pour l'API Render
      const renderRequestData = {
        ...requestData,
        extractionId,
        callbackUrl: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000",
      }

      console.log("Données envoyées à l'API Render:", {
        ...renderRequestData,
        credentials: "***HIDDEN***",
      })

      const response = await fetch(`${renderApiUrl}/api/extract-votes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
        body: JSON.stringify(renderRequestData),
        signal: AbortSignal.timeout(30000), // 30 secondes
      })

      console.log(`Réponse de l'API Render: ${response.status} ${response.statusText}`)

      if (!response.ok) {
        console.log(`L'API Render a répondu avec une erreur ${response.status}, erreur`)
        return NextResponse.json(
          {
            error: `Erreur lors du démarrage de l'extraction (statut: ${response.status})`,
            message:
              "Une erreur s'est produite lors du démarrage de l'extraction. Veuillez réessayer ou contacter l'administrateur système.",
          },
          { status: response.status },
        )
      }

      // Lire la réponse de l'API Render
      const data = await response.json()
      console.log("Données reçues de l'API Render:", data)

      // Retourner les données initiales de l'API Render
      return NextResponse.json({
        extractionId,
        status: "in-progress",
        message: "Extraction démarrée via l'API Render",
        votes: data.votes || [],
        token: generateToken(extractionId),
        renderResponse: data,
      })
    } catch (error: any) {
      console.error("Erreur lors de l'appel à l'API Render:", error)

      return NextResponse.json(
        {
          error: `Erreur de communication avec le serveur d'extraction: ${error.message}`,
          message:
            "Impossible de communiquer avec le serveur d'extraction. Veuillez vérifier votre connexion et réessayer.",
        },
        { status: 500 },
      )
    }
  } catch (error: any) {
    console.error("Erreur générale:", error)
    return NextResponse.json(
      {
        error: `Erreur lors du démarrage de l'extraction: ${error.message}`,
        message: "Une erreur inattendue s'est produite. Veuillez réessayer ou contacter l'administrateur système.",
      },
      { status: 500 },
    )
  }
}
