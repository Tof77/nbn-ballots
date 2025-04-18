import { type NextRequest, NextResponse } from "next/server"

// Définir le runtime Edge pour cette route API
export const runtime = "edge"
// Définir la durée maximale d'exécution à 60 secondes
export const maxDuration = 60

// Définir les interfaces pour les types de données
interface VoteDetail {
  participant: string
  vote: string
  castBy: string
  date: string
}

interface Vote {
  id: string
  ref: string
  title: string
  committee: string
  votes: string
  result: string
  status: string
  openingDate: string
  closingDate: string
  role: string
  sourceType: string
  source: string
  voteDetails?: VoteDetail[] // Propriété optionnelle pour les détails des votes
}

// Fonction pour déchiffrer les données simulées
function simulateDecryption(encryptedData: string): string {
  try {
    // Décodage base64 et vérification du préfixe "demo:"
    const decoded = atob(encryptedData)
    if (!decoded.startsWith("demo:")) {
      throw new Error("Format de données invalide")
    }
    return decoded.substring(5) // Enlever le préfixe "demo:"
  } catch (error) {
    console.error("API - Erreur lors du déchiffrement simulé:", error)
    throw new Error("Échec du déchiffrement des données")
  }
}

// Fonction pour extraire le code de commission
function extractCommissionCode(commissionId: string): string {
  // Rechercher un pattern comme E088/089, E123, etc.
  if (commissionId.includes("Buildwise/E")) {
    const parts = commissionId.split("/")
    return parts[parts.length - 1]
  } else if (commissionId.includes("E")) {
    return commissionId
  }
  return "Unknown"
}

export async function POST(req: NextRequest) {
  const diagnostics: string[] = []
  const startTime = Date.now()

  try {
    // Récupérer et journaliser les données brutes
    const requestData = await req.json()
    diagnostics.push("Données reçues dans l'API Edge")

    // URL de votre API Render
    const renderApiUrl = process.env.RENDER_API_URL
    diagnostics.push(`RENDER_API_URL: ${renderApiUrl || "non définie"}`)

    let isRenderApiAvailable = false
    let renderApiError = null

    if (renderApiUrl) {
      try {
        diagnostics.push(`Tentative d'appel à l'API Render depuis l'API Edge: ${renderApiUrl}/api/extract-votes`)

        // Ajouter une note concernant la possibilité d'une fenêtre GDPR
        diagnostics.push(
          "Note: Si l'API ne répond pas, il est possible qu'une fenêtre de confirmation GDPR soit affichée sur le serveur Render.",
        )

        // Vérifier d'abord si l'API Render est accessible
        try {
          const pingResponse = await fetch(renderApiUrl, {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(5000),
          })

          if (!pingResponse.ok) {
            diagnostics.push(
              `L'API Render a répondu avec un statut ${pingResponse.status}, utilisation du mode démonstration`,
            )
            throw new Error(`L'API Render a répondu avec un statut ${pingResponse.status}`)
          }

          isRenderApiAvailable = true
          diagnostics.push("L'API Render est accessible")
        } catch (pingError) {
          renderApiError = pingError
          diagnostics.push(
            `Erreur lors du ping de l'API Render: ${pingError instanceof Error ? pingError.message : String(pingError)}`,
          )
          diagnostics.push("Utilisation du mode démonstration")
        }

        // Si l'API Render est accessible, essayer d'appeler l'endpoint d'extraction
        if (isRenderApiAvailable) {
          // Appeler l'API Render
          const response = await fetch(`${renderApiUrl}/api/extract-votes`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestData),
            signal: AbortSignal.timeout(30000), // 30 secondes de timeout
          })

          // Récupérer la réponse
          const responseText = await response.text()

          let responseData
          try {
            responseData = JSON.parse(responseText)
          } catch (error) {
            diagnostics.push(
              `Erreur lors du parsing de la réponse JSON: ${error instanceof Error ? error.message : String(error)}`,
            )
            return NextResponse.json(
              {
                error: "Format de réponse invalide",
                details: "La réponse de l'API externe n'est pas un JSON valide",
                receivedResponse: responseText.substring(0, 500) + "...", // Afficher les 500 premiers caractères
                diagnostics,
              },
              { status: 502 },
            )
          }

          if (!response.ok) {
            diagnostics.push(`Erreur de l'API Render: ${JSON.stringify(responseData, null, 2)}`)
            renderApiError = new Error(responseData.error || `Statut HTTP: ${response.status}`)
            diagnostics.push("Utilisation du mode démonstration suite à une erreur de l'API Render")
          } else {
            // Ajouter les diagnostics à la réponse
            if (!responseData.diagnostics) {
              responseData.diagnostics = diagnostics
            }

            return NextResponse.json(responseData)
          }
        }
      } catch (error) {
        renderApiError = error
        diagnostics.push(
          `Erreur lors de l'appel à l'API Render: ${error instanceof Error ? error.message : String(error)}`,
        )
        diagnostics.push("Utilisation des données simulées en fallback")
      }
    } else {
      diagnostics.push("RENDER_API_URL non définie, utilisation des données simulées")
    }

    // Si l'API Render n'est pas disponible ou si une erreur s'est produite, utiliser les données simulées
    const { commissionId, startDate, extractDetails = true, credentials } = requestData

    // Ajouter un message de diagnostic sur l'erreur spécifique
    if (renderApiError) {
      diagnostics.push(
        `Détection du mode de démonstration suite à l'erreur: ${renderApiError instanceof Error ? renderApiError.message : String(renderApiError)}`,
      )
      diagnostics.push("Activation du mode de démonstration avec données simulées")
    }

    // Vérifier que les identifiants chiffrés sont fournis
    if (!credentials || !credentials.encryptedUsername || !credentials.encryptedPassword) {
      return NextResponse.json(
        {
          error: "Identifiants chiffrés manquants",
          diagnostics,
        },
        { status: 400 },
      )
    }

    let username, password

    try {
      // Déchiffrer les identifiants simulés
      username = simulateDecryption(credentials.encryptedUsername)
      password = simulateDecryption(credentials.encryptedPassword)
      diagnostics.push("Identifiants déchiffrés avec succès")
    } catch (error) {
      diagnostics.push(`Erreur lors du déchiffrement: ${error instanceof Error ? error.message : String(error)}`)
      return NextResponse.json(
        {
          error: "Échec du déchiffrement des identifiants",
          details: error instanceof Error ? error.message : String(error),
          diagnostics,
        },
        { status: 400 },
      )
    }

    // Extraire le code de commission
    const commissionCode = extractCommissionCode(commissionId)
    diagnostics.push(`Code de commission extrait: ${commissionCode}`)
    diagnostics.push(`MODE DÉMONSTRATION: Génération de données simulées pour la commission ${commissionCode}`)

    // Générer des données réalistes basées sur la capture d'écran fournie
    const votes: Vote[] = []

    // Si la commission est E088/089, utiliser les données de la capture d'écran
    if (commissionCode === "E088/089") {
      // Données extraites de la capture d'écran
      const realVotes: Vote[] = [
        {
          id: "e088-1",
          ref: "ISO/DIS 21239",
          title: "ISO/DIS 21239 - Building Information Modeling",
          committee: "Buildwise/E088/089",
          votes: "",
          result: "Closed without votes",
          status: "Closed",
          openingDate: "2024-12-24",
          closingDate: "2025-03-01",
          role: "Ballot owner",
          sourceType: "ISO/DIS",
          source: "ISO/TC 163/SC 3",
          voteDetails: [],
        },
        {
          id: "e088-2",
          ref: "EN ISO 52016-3 2023/prA1",
          title: "Energy performance of buildings - Energy needs for heating and cooling",
          committee: "Buildwise/E088/089",
          votes: "",
          result: "Closed without votes",
          status: "Closed",
          openingDate: "2024-12-24",
          closingDate: "2025-03-04",
          role: "Ballot owner",
          sourceType: "CEN/CENENQ",
          source: "CEN/TC 89",
          voteDetails: [],
        },
        {
          id: "e088-3",
          ref: "ISO 52016-3 2023/DAmd 1",
          title: "Energy performance of buildings - Amendment 1",
          committee: "Buildwise/E088/089",
          votes: "",
          result: "Closed without votes",
          status: "Closed",
          openingDate: "2024-12-27",
          closingDate: "2025-03-04",
          role: "Ballot owner",
          sourceType: "ISO/DIS",
          source: "ISO/TC 163/SC 2",
          voteDetails: [],
        },
        {
          id: "e088-4",
          ref: "FprEN 17990",
          title: "Sustainability of construction works",
          committee: "Buildwise/E088/089",
          votes: "",
          result: "Closed without votes",
          status: "Closed",
          openingDate: "2025-01-28",
          closingDate: "2025-03-08",
          role: "Ballot owner",
          sourceType: "CEN/CENFV",
          source: "CEN/TC 89",
          voteDetails: [],
        },
        {
          id: "e088-5",
          ref: "Draft Decision 975c/2025 - Adoption of NWI pending behaviour",
          title: "Adoption of New Work Item - Pending behaviour",
          committee: "Buildwise/E088/089",
          votes: "",
          result: "Abstention",
          status: "Closed",
          openingDate: "2025-01-29",
          closingDate: "2025-03-10",
          role: "Ballot owner",
          sourceType: "CEN/CIB-NWI",
          source: "CEN/TC 88",
          voteDetails: [],
        },
        {
          id: "e088-6",
          ref: "Draft Decision 975c/2025 - Adoption of NWI reaction to fire",
          title: "Adoption of New Work Item - Reaction to fire",
          committee: "Buildwise/E088/089",
          votes: "",
          result: "Abstention",
          status: "Closed",
          openingDate: "2025-01-29",
          closingDate: "2025-03-10",
          role: "Ballot owner",
          sourceType: "CEN/CIB-NWI",
          source: "CEN/TC 88",
          voteDetails: [],
        },
        {
          id: "e088-7",
          ref: "Draft Decision 995c - TC 88 Liaison with EXCA",
          title: "TC 88 Liaison with EXCA",
          committee: "Buildwise/E088/089",
          votes: "3 votes",
          result: "Approved",
          status: "Closed",
          openingDate: "2025-03-12",
          closingDate: "2025-03-23",
          role: "Ballot owner",
          sourceType: "CEN/CENCIB",
          source: "CEN/TC 88",
          voteDetails: [],
        },
        {
          id: "e088-8",
          ref: "Confirmation of several EN standards after Systematic Review",
          title: "Confirmation of several EN standards after Systematic Review",
          committee: "Buildwise/E088/089",
          votes: "1 vote",
          result: "Approved",
          status: "Closed",
          openingDate: "2025-03-12",
          closingDate: "2025-03-24",
          role: "Ballot owner",
          sourceType: "CEN/CENCIB",
          source: "CEN/TC 88",
          voteDetails: [],
        },
        {
          id: "e088-9",
          ref: "Revise ISO 14484-3 under VA (by Correspondence)",
          title: "Revise ISO 14484-3 under Vienna Agreement (by Correspondence)",
          committee: "Buildwise/E088/089",
          votes: "1 vote",
          result: "Approved",
          status: "Closed",
          openingDate: "2025-03-12",
          closingDate: "2025-03-24",
          role: "Ballot owner",
          sourceType: "ISO/CIB",
          source: "ISO/TC 205",
          voteDetails: [],
        },
        {
          id: "e088-10",
          ref: "National Implementation of ISO 11561-1999",
          title: "National Implementation of ISO 11561-1999",
          committee: "Buildwise/E088/089",
          votes: "1 vote",
          result: "Disapproved",
          status: "Closed",
          openingDate: "2025-02-10",
          closingDate: "2025-03-31",
          role: "Ballot owner",
          sourceType: "",
          source: "",
          voteDetails: [],
        },
      ]

      // Ajouter des détails de vote si demandé
      if (extractDetails) {
        for (const vote of realVotes) {
          if (vote.votes && vote.votes.includes("vote")) {
            const numVotes = Number.parseInt(vote.votes.split(" ")[0]) || 1

            // S'assurer que voteDetails est initialisé
            if (!vote.voteDetails) {
              vote.voteDetails = []
            }

            const countries = ["Belgium", "France", "Germany", "Netherlands", "Italy"]
            const voteOptions = ["Approve", "Approve with comments", "Disapprove", "Abstain"]

            for (let i = 0; i < numVotes; i++) {
              const voteDate = new Date(vote.openingDate)
              voteDate.setDate(voteDate.getDate() + Math.floor(Math.random() * 10) + 1)

              vote.voteDetails.push({
                participant: countries[i % countries.length],
                vote: vote.result.includes("Approved") ? voteOptions[0] : voteOptions[3],
                castBy: `NBN User ${i + 1}`,
                date: voteDate.toISOString().split("T")[0],
              })
            }
          }
        }
      }

      votes.push(...realVotes)
    } else {
      // Pour les autres commissions, générer des données fictives mais réalistes
      // Nombre de votes à générer
      const numVotes = 5

      for (let i = 0; i < numVotes; i++) {
        const closingDate = new Date(startDate || "2025-01-01")
        closingDate.setDate(closingDate.getDate() + i * 7 + Math.floor(Math.random() * 10))

        const openingDate = new Date(closingDate)
        openingDate.setDate(openingDate.getDate() - 30)

        const vote: Vote = {
          id: `${commissionCode.toLowerCase().replace("/", "-")}-${i + 1}`,
          ref: `prEN ${1000 + i}`,
          title: `Standard for ${commissionCode} - Part ${i + 1}`,
          committee: commissionId.includes("Buildwise") ? commissionId.split("/").slice(-2).join("/") : commissionId,
          votes: i % 2 === 0 ? `${i + 1} votes` : "",
          result: i % 3 === 0 ? "Disapproved" : "Approved",
          status: i === numVotes - 1 ? "Ongoing" : "Closed",
          openingDate: openingDate.toISOString().split("T")[0],
          closingDate: closingDate.toISOString().split("T")[0],
          role: "Ballot owner",
          sourceType: i % 2 === 0 ? "ISO" : "CEN",
          source: `ISO/TC ${200 + i}/SC ${i + 1}`,
          voteDetails: [], // Initialiser avec un tableau vide
        }

        // Ajouter des détails de vote si demandé
        if (extractDetails && vote.votes) {
          const numVoteDetails = Number.parseInt(vote.votes.split(" ")[0]) || 0

          const countries = ["Belgium", "France", "Germany", "Netherlands", "Italy"]
          const voteOptions = ["Approve", "Approve with comments", "Disapprove", "Abstain"]

          for (let j = 0; j < numVoteDetails; j++) {
            const voteDate = new Date(vote.openingDate)
            voteDate.setDate(voteDate.getDate() + Math.floor(Math.random() * 20) + 1)

            // Utiliser l'opérateur non-null assertion (!) car nous savons que voteDetails est initialisé
            vote.voteDetails!.push({
              participant: countries[j % countries.length],
              vote: vote.result === "Approved" ? voteOptions[0] : voteOptions[2],
              castBy: `User ${j + 1}`,
              date: voteDate.toISOString().split("T")[0],
            })
          }
        }

        votes.push(vote)
      }
    }

    const totalDuration = Date.now() - startTime
    diagnostics.push(`Durée totale de traitement: ${totalDuration}ms`)

    return NextResponse.json({
      votes,
      debug: {
        receivedCommissionId: commissionId,
        extractedCommissionCode: commissionCode,
        username: username,
        startDate: startDate,
        numVotesGenerated: votes.length,
        source: "edge-fallback",
        demoMode: true,
      },
      diagnostics,
      renderApiStatus: "unavailable",
      renderApiMessage: "L'API Render n'est pas disponible. Utilisation du mode démonstration avec données simulées.",
    })
  } catch (error) {
    const totalDuration = Date.now() - startTime
    diagnostics.push(`Durée totale jusqu'à l'erreur: ${totalDuration}ms`)
    diagnostics.push(`Erreur générale: ${error instanceof Error ? error.message : String(error)}`)
    return NextResponse.json(
      {
        error: "Erreur lors de l'extraction des votes",
        details: error instanceof Error ? error.message : String(error),
        diagnostics,
      },
      { status: 500 },
    )
  }
}
