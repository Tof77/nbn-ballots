import { type NextRequest, NextResponse } from "next/server"
import { v4 as uuidv4 } from "uuid"

// Définir le runtime Node.js pour cette route API
export const runtime = "nodejs"

export async function POST(req: NextRequest): Promise<Response> {
  try {
    // Récupérer les données depuis le corps de la requête
    const requestData = await req.json()
    const { credentials, commissionId, startDate, extractDetails } = requestData

    // Valider les identifiants
    if (!credentials || !credentials.encryptedUsername || !credentials.encryptedPassword) {
      return NextResponse.json({ error: "Identifiants chiffrés requis" }, { status: 400 })
    }

    // Utiliser les identifiants chiffrés ou déchiffrés selon ce qui est disponible
    const username = credentials.username || credentials.encryptedUsername
    const password = credentials.password || credentials.encryptedPassword

    // Générer un ID unique pour cette extraction
    const extractionId = uuidv4()
    console.log(`Nouvelle extraction démarrée: ${extractionId}`)

    // Déterminer l'URL de l'API Render
    const renderApiUrl = process.env.RENDER_API_URL || "https://nbn-ballots-api.onrender.com"
    console.log(`URL de l'API Render: ${renderApiUrl}`)

    // Construire l'URL complète - Essayer avec le préfixe /api/
    const extractionEndpoint = `${renderApiUrl}/api/extract-votes`
    console.log(`URL complète de l'endpoint d'extraction: ${extractionEndpoint}`)

    // Construire l'URL de callback
    const callbackUrl =
      process.env.VERCEL_CALLBACK_URL ||
      `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://nbn-ballots.vercel.app"}/api/extraction-stream`
    console.log(`URL de callback: ${callbackUrl}`)

    // Préparer les données à envoyer
    const renderRequestData = {
      username,
      password,
      commissionId,
      startDate,
      extractDetails,
      extractionId,
      callbackUrl,
    }

    // Envoyer une requête à l'API Render pour démarrer l'extraction
    try {
      console.log(`Tentative de connexion à l'API Render: ${extractionEndpoint}`)

      const renderResponse = await fetch(extractionEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(renderRequestData),
      })

      // Vérifier si la réponse est OK
      if (!renderResponse.ok) {
        console.error(`Erreur HTTP de l'API Render: ${renderResponse.status} ${renderResponse.statusText}`)

        // Lire le corps de la réponse
        const responseText = await renderResponse.text()
        console.error("Corps de la réponse:", responseText.substring(0, 500))

        return NextResponse.json(
          {
            error: `Erreur HTTP ${renderResponse.status} lors de la connexion à l'API d'extraction`,
            details: responseText.substring(0, 200) + (responseText.length > 200 ? "..." : ""),
            status: renderResponse.status,
          },
          { status: 500 },
        )
      }

      // Lire le corps de la réponse
      const responseText = await renderResponse.text()
      console.log("Réponse brute de l'API Render:", responseText.substring(0, 500))

      // Essayer de parser la réponse comme JSON
      let renderData
      try {
        renderData = JSON.parse(responseText)
      } catch (parseError) {
        console.error("Erreur lors du parsing de la réponse JSON:", parseError)
        console.error("Réponse brute:", responseText.substring(0, 500))

        // Si nous ne pouvons pas parser la réponse comme JSON, retourner une erreur
        return NextResponse.json(
          {
            error: "La réponse de l'API Render n'est pas un JSON valide",
            details: responseText.substring(0, 200) + (responseText.length > 200 ? "..." : ""),
            extractionId, // Retourner quand même l'ID d'extraction pour permettre le polling
          },
          { status: 207 },
        ) // 207 Multi-Status pour indiquer un succès partiel
      }

      console.log("Réponse JSON de l'API Render:", renderData)

      // Retourner l'ID d'extraction au client
      return NextResponse.json({
        extractionId,
        message: "Extraction démarrée avec succès",
        renderResponse: renderData,
      })
    } catch (error: any) {
      console.error("Erreur lors de la connexion à l'API Render:", error)

      // En cas d'erreur de connexion à l'API Render, simuler une réponse positive
      // pour permettre le développement sans dépendance à l'API externe
      if (process.env.NODE_ENV === "development") {
        console.log("Mode développement: simulation d'une réponse positive")

        // Simuler une mise à jour après un délai
        setTimeout(() => {
          simulateExtractionUpdate(extractionId)
        }, 2000)

        return NextResponse.json({
          extractionId,
          message: "Extraction démarrée (simulation en mode développement)",
          error: error.message,
          details: "Erreur ignorée en mode développement",
        })
      }

      // Vérifier si l'erreur est due à une URL invalide
      if (
        error.message &&
        (error.message.includes("ENOTFOUND") ||
          error.message.includes("ECONNREFUSED") ||
          error.message.includes("Invalid URL"))
      ) {
        return NextResponse.json(
          {
            error:
              "Impossible de se connecter à l'API Render. L'URL est peut-être incorrecte ou le service est indisponible.",
            details: error.message,
            renderApiUrl,
            extractionEndpoint,
          },
          { status: 503 },
        ) // Service Unavailable
      }

      return NextResponse.json(
        {
          error: `Erreur lors de la connexion à l'API d'extraction: ${error.message}`,
          details: error.stack,
        },
        { status: 500 },
      )
    }
  } catch (error: any) {
    console.error("Erreur lors du démarrage de l'extraction:", error)
    return NextResponse.json(
      {
        error: `Erreur lors du démarrage de l'extraction: ${error instanceof Error ? error.message : String(error)}`,
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    )
  }
}

// Fonction pour simuler des mises à jour d'extraction en mode développement
async function simulateExtractionUpdate(extractionId: string) {
  try {
    const callbackUrl = process.env.VERCEL_CALLBACK_URL || "https://nbn-ballots.vercel.app/api/extraction-stream"

    // Simuler quelques votes
    const sampleVotes = [
      {
        id: "vote1",
        ref: "REF-001",
        title: "Vote sur la proposition A",
        committee: "Comité technique",
        votes: "12 pour, 3 contre",
        result: "Approuvé",
        status: "Terminé",
        openingDate: "2023-01-01",
        closingDate: "2023-01-15",
        role: "Membre",
        sourceType: "NBN",
        source: "Simulation",
      },
      {
        id: "vote2",
        ref: "REF-002",
        title: "Vote sur la proposition B",
        committee: "Comité de normalisation",
        votes: "8 pour, 7 contre",
        result: "Approuvé",
        status: "Terminé",
        openingDate: "2023-02-01",
        closingDate: "2023-02-15",
        role: "Membre",
        sourceType: "NBN",
        source: "Simulation",
      },
    ]

    // Envoyer une première mise à jour
    await fetch(callbackUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        extractionId,
        status: "in-progress",
        message: "Extraction en cours...",
        votes: [sampleVotes[0]],
      }),
    })

    // Envoyer une deuxième mise à jour après un délai
    setTimeout(async () => {
      await fetch(callbackUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          extractionId,
          status: "in-progress",
          message: "Extraction en cours... (50%)",
          votes: [sampleVotes[1]],
        }),
      })

      // Finaliser l'extraction après un autre délai
      setTimeout(async () => {
        await fetch(callbackUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            extractionId,
            status: "completed",
            message: "Extraction terminée avec succès",
            votes: [],
          }),
        })
      }, 5000)
    }, 5000)
  } catch (error) {
    console.error("Erreur lors de la simulation de mise à jour:", error)
  }
}
