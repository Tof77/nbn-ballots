import { type NextRequest, NextResponse } from "next/server"

// Définir le runtime Node.js pour cette route API
export const runtime = "nodejs"
// Définir la durée maximale d'exécution à 60 secondes
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    // Récupérer et journaliser les données brutes
    const requestText = await req.text()
    console.log("API - Données brutes reçues:", requestText)

    // Parser les données JSON
    let requestData
    try {
      requestData = JSON.parse(requestText)
    } catch (error) {
      console.error("API - Erreur lors du parsing JSON:", error)
      return NextResponse.json(
        {
          error: "Format de données invalide",
          details: "Les données reçues ne sont pas un JSON valide",
          receivedData: requestText.substring(0, 100) + "...", // Afficher les 100 premiers caractères
        },
        { status: 400 },
      )
    }

    // Journaliser les données reçues (sans les identifiants sensibles)
    const sanitizedData = {
      ...requestData,
      credentials: requestData.credentials
        ? {
            encryptedUsername: "***HIDDEN***",
            encryptedPassword: "***HIDDEN***",
          }
        : undefined,
    }
    console.log("API - Données reçues:", JSON.stringify(sanitizedData, null, 2))

    // URL de votre API Render
    const renderApiUrl = process.env.RENDER_API_URL || "https://nbn-ballots.onrender.com/api/extract-votes"

    // Appeler l'API externe sur Render
    console.log(`API - Appel de l'API externe: ${renderApiUrl}`)
    const response = await fetch(renderApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestData),
    })

    // Récupérer la réponse
    const responseText = await response.text()
    console.log(`API - Réponse de l'API externe (statut: ${response.status}):`, responseText.substring(0, 200) + "...")

    let responseData
    try {
      responseData = JSON.parse(responseText)
    } catch (error) {
      console.error("API - Erreur lors du parsing de la réponse JSON:", error)
      return NextResponse.json(
        {
          error: "Format de réponse invalide",
          details: "La réponse de l'API externe n'est pas un JSON valide",
          receivedResponse: responseText.substring(0, 500) + "...", // Afficher les 500 premiers caractères
        },
        { status: 502 },
      )
    }

    if (!response.ok) {
      console.error("API - Erreur de l'API externe:", responseData)
      return NextResponse.json(
        {
          error: "Erreur de l'API externe",
          details: responseData.error || `Statut HTTP: ${response.status}`,
        },
        { status: 502 },
      )
    }

    // Retourner les données de l'API externe
    return NextResponse.json(responseData)
  } catch (error) {
    console.error("API - Erreur générale:", error)
    return NextResponse.json(
      {
        error: "Erreur lors de l'extraction des votes",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
