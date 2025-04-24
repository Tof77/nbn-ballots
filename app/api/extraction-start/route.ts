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
    const renderApiUrl = process.env.RENDER_API_URL || "http://localhost:3001"

    // Envoyer une requête à l'API Render pour démarrer l'extraction
    // Note: Dans un environnement de développement, cela peut être simulé
    try {
      console.log(`Tentative de connexion à l'API Render: ${renderApiUrl}/extract-votes`)

      const renderResponse = await fetch(`${renderApiUrl}/extract-votes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
          commissionId,
          startDate,
          extractDetails,
          extractionId,
          callbackUrl:
            process.env.VERCEL_CALLBACK_URL ||
            `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"}/api/extraction-stream`,
        }),
      })

      const renderData = await renderResponse.json()

      if (!renderResponse.ok) {
        console.error("Erreur de l'API Render:", renderData)
        return NextResponse.json(
          { error: renderData.error || "Erreur lors de la connexion à l'API d'extraction" },
          { status: renderResponse.status },
        )
      }

      console.log("Réponse de l'API Render:", renderData)

      // Retourner l'ID d'extraction au client
      return NextResponse.json({
        extractionId,
        message: "Extraction démarrée avec succès",
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
        })
      }

      return NextResponse.json(
        { error: `Erreur lors de la connexion à l'API d'extraction: ${error.message}` },
        { status: 500 },
      )
    }
  } catch (error: any) {
    console.error("Erreur lors du démarrage de l'extraction:", error)
    return NextResponse.json({ error: `Erreur lors du démarrage de l'extraction: ${error.message}` }, { status: 500 })
  }
}

// Fonction pour simuler des mises à jour d'extraction en mode développement
async function simulateExtractionUpdate(extractionId: string) {
  try {
    const callbackUrl = process.env.VERCEL_CALLBACK_URL || "http://localhost:3000/api/extraction-stream"

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
