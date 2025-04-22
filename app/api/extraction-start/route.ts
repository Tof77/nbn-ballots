import { type NextRequest, NextResponse } from "next/server"
import crypto from "crypto"

// Définir le runtime Node.js pour cette route API
export const runtime = "nodejs"
// Définir la durée maximale d'exécution à 60 secondes
export const maxDuration = 60

// Map pour stocker les extractions en cours
const extractionsMap = new Map<
  string,
  {
    id: string
    status: "pending" | "in-progress" | "completed" | "failed"
    votes: any[]
    startTime: number
    endTime?: number
    message?: string
    demoMode: boolean
  }
>()

// Fonction pour générer un ID unique
function generateExtractionId(): string {
  return `extract-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`
}

// Fonction pour déchiffrer les données simulées
function simulateDecryption(encryptedData: string): string {
  try {
    // Décodage base64 et vérification du préfixe "demo:"
    const decoded = Buffer.from(encryptedData, "base64").toString("utf-8")
    if (!decoded.startsWith("demo:")) {
      throw new Error("Format de données invalide")
    }
    return decoded.substring(5) // Enlever le préfixe "demo:"
  } catch (error) {
    console.error("Erreur lors du déchiffrement simulé:", error)
    throw new Error("Échec du déchiffrement des données")
  }
}

export async function POST(req: NextRequest) {
  try {
    const requestData = await req.json()

    // Valider les données requises
    if (!requestData.commissionId || !requestData.startDate || !requestData.credentials) {
      return NextResponse.json(
        { error: "Paramètres manquants (commissionId, startDate, credentials)" },
        { status: 400 },
      )
    }

    // Générer un ID d'extraction unique
    const extractionId = generateExtractionId()

    // Créer une entrée dans la map pour cette extraction
    extractionsMap.set(extractionId, {
      id: extractionId,
      status: "pending",
      votes: [],
      startTime: Date.now(),
      demoMode: requestData.forceDemoMode || false,
    })

    // Démarrer l'extraction en arrière-plan
    startExtraction(extractionId, requestData)

    // Retourner immédiatement l'ID d'extraction
    return NextResponse.json({
      extractionId,
      status: "pending",
      message: "Extraction démarrée",
    })
  } catch (error: any) {
    return NextResponse.json({ error: `Erreur lors du démarrage de l'extraction: ${error.message}` }, { status: 500 })
  }
}

// Fonction pour démarrer l'extraction en arrière-plan
async function startExtraction(extractionId: string, requestData: any) {
  const extraction = extractionsMap.get(extractionId)
  if (!extraction) return

  try {
    // Mettre à jour le statut
    extraction.status = "in-progress"
    extractionsMap.set(extractionId, extraction)

    // Vérifier si le mode démo est forcé
    if (requestData.forceDemoMode) {
      // Simuler une extraction progressive en mode démo
      await simulateProgressiveExtraction(extractionId, requestData)
      return
    }

    // Essayer d'appeler l'API Render pour une extraction réelle
    const renderApiUrl = process.env.RENDER_API_URL
    if (!renderApiUrl) {
      throw new Error("RENDER_API_URL non définie")
    }

    try {
      // Tester si l'API Render est accessible
      const pingResponse = await fetch(`${renderApiUrl}/ping`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      })

      if (!pingResponse.ok) {
        throw new Error(`L'API Render a répondu avec un statut ${pingResponse.status}`)
      }

      // Appeler l'API Render pour démarrer l'extraction
      const response = await fetch(`${renderApiUrl}/api/extract-votes-stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...requestData,
          extractionId,
        }),
        signal: AbortSignal.timeout(30000),
      })

      if (!response.ok) {
        throw new Error(`Erreur de l'API Render: ${response.status}`)
      }

      // Lire la réponse
      const data = await response.json()

      // Si l'API Render a déjà des résultats, les ajouter
      if (data.votes && Array.isArray(data.votes)) {
        const extraction = extractionsMap.get(extractionId)
        if (extraction) {
          extraction.votes = data.votes
          extraction.status = data.status || "in-progress"
          extraction.message = data.message
          extractionsMap.set(extractionId, extraction)
        }
      }
    } catch (error: any) {
      console.error("Erreur lors de l'appel à l'API Render:", error)

      // En cas d'erreur, passer en mode démo
      const extraction = extractionsMap.get(extractionId)
      if (extraction) {
        extraction.demoMode = true
        extractionsMap.set(extractionId, extraction)
      }

      // Simuler une extraction progressive en mode démo
      await simulateProgressiveExtraction(extractionId, requestData)
    }
  } catch (error: any) {
    // En cas d'erreur, marquer l'extraction comme échouée
    const extraction = extractionsMap.get(extractionId)
    if (extraction) {
      extraction.status = "failed"
      extraction.message = error.message
      extraction.endTime = Date.now()
      extractionsMap.set(extractionId, extraction)
    }
  }
}

// Fonction pour simuler une extraction progressive en mode démo
async function simulateProgressiveExtraction(extractionId: string, requestData: any) {
  const extraction = extractionsMap.get(extractionId)
  if (!extraction) return

  try {
    // Déchiffrer les identifiants simulés
    const username = simulateDecryption(requestData.credentials.encryptedUsername)
    const password = simulateDecryption(requestData.credentials.encryptedPassword)

    // Générer des votes simulés
    const totalVotes = Math.floor(Math.random() * 10) + 5 // Entre 5 et 15 votes

    // Ajouter les votes progressivement
    for (let i = 0; i < totalVotes; i++) {
      // Vérifier si l'extraction existe toujours
      const currentExtraction = extractionsMap.get(extractionId)
      if (!currentExtraction || currentExtraction.status === "failed") {
        break
      }

      // Créer un vote simulé
      const vote = createSimulatedVote(i, requestData.commissionId, requestData.startDate, requestData.extractDetails)

      // Ajouter le vote à l'extraction
      currentExtraction.votes.push(vote)
      extractionsMap.set(extractionId, currentExtraction)

      // Attendre un peu pour simuler le temps d'extraction
      await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1000))
    }

    // Marquer l'extraction comme terminée
    const finalExtraction = extractionsMap.get(extractionId)
    if (finalExtraction) {
      finalExtraction.status = "completed"
      finalExtraction.endTime = Date.now()
      finalExtraction.message = "Extraction terminée avec succès (mode démo)"
      extractionsMap.set(extractionId, finalExtraction)
    }
  } catch (error: any) {
    // En cas d'erreur, marquer l'extraction comme échouée
    const extraction = extractionsMap.get(extractionId)
    if (extraction) {
      extraction.status = "failed"
      extraction.message = error.message
      extraction.endTime = Date.now()
      extractionsMap.set(extractionId, extraction)
    }
  }
}

// Fonction pour créer un vote simulé
function createSimulatedVote(index: number, commissionId: string, startDate: string, extractDetails: boolean) {
  const closingDate = new Date(startDate || "2025-01-01")
  closingDate.setDate(closingDate.getDate() + index * 7 + Math.floor(Math.random() * 10))

  const openingDate = new Date(closingDate)
  openingDate.setDate(openingDate.getDate() - 30)

  const vote = {
    id: `vote-${index + 1}`,
    ref: `prEN ${1000 + index}`,
    title: `Standard for Demo - Part ${index + 1}`,
    committee: commissionId,
    votes: index % 2 === 0 ? `${(index % 3) + 1} votes` : "",
    result: index % 3 === 0 ? "Disapproved" : "Approved",
    status: index === 0 ? "Ongoing" : "Closed",
    openingDate: openingDate.toISOString().split("T")[0],
    closingDate: closingDate.toISOString().split("T")[0],
    role: "Ballot owner",
    sourceType: index % 2 === 0 ? "ISO" : "CEN",
    source: `ISO/TC ${200 + index}/SC ${index + 1}`,
    voteDetails: [] as any[],
  }

  // Ajouter des détails de vote si demandé
  if (extractDetails && vote.votes) {
    const numVoteDetails = Number.parseInt(vote.votes.split(" ")[0]) || 0

    const countries = ["Belgium", "France", "Germany", "Netherlands", "Italy"]
    const voteOptions = ["Approve", "Approve with comments", "Disapprove", "Abstain"]

    for (let j = 0; j < numVoteDetails; j++) {
      const voteDate = new Date(vote.openingDate)
      voteDate.setDate(voteDate.getDate() + Math.floor(Math.random() * 20) + 1)

      vote.voteDetails.push({
        participant: countries[j % countries.length],
        vote: vote.result === "Approved" ? voteOptions[0] : voteOptions[2],
        castBy: `User ${j + 1}`,
        date: voteDate.toISOString().split("T")[0],
      })
    }
  }

  return vote
}
