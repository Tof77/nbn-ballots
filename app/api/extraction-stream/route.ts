import { type NextRequest, NextResponse } from "next/server"

// Définir le runtime Node.js pour cette route API
export const runtime = "nodejs"
// Définir la durée maximale d'exécution à 30 secondes
export const maxDuration = 30

// Interface pour un vote
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
  voteDetails?: VoteDetail[]
}

// Interface pour les détails d'un vote
interface VoteDetail {
  participant: string
  vote: string
  castBy: string
  date: string
}

// Map pour stocker temporairement les données d'extraction
// Note: Cette map sera réinitialisée à chaque redéploiement ou redémarrage
const extractionsCache = new Map<
  string,
  {
    votes: Vote[]
    lastUpdated: number
    status: "pending" | "in-progress" | "completed" | "failed"
    message?: string
    demoMode: boolean
  }
>()

export async function GET(req: NextRequest) {
  try {
    // Récupérer l'ID d'extraction depuis les paramètres de requête
    const { searchParams } = new URL(req.url)
    const extractionId = searchParams.get("id")
    const token = searchParams.get("token")

    if (!extractionId) {
      return NextResponse.json({ error: "ID d'extraction manquant" }, { status: 400 })
    }

    console.log(`Récupération de l'extraction ${extractionId}`)

    // Vérifier si nous avons des données en cache pour cette extraction
    const cachedData = extractionsCache.get(extractionId)

    if (cachedData) {
      console.log(`Données en cache trouvées pour ${extractionId}`)

      // Si l'extraction est en cours, simuler une progression
      if (cachedData.status === "in-progress") {
        const elapsedTime = Date.now() - cachedData.lastUpdated
        const progress = Math.min(100, Math.floor((elapsedTime / 30000) * 100)) // 30 secondes pour compléter

        // Si la progression atteint 100%, marquer comme terminée
        if (progress >= 100 && cachedData.status !== "completed") {
          cachedData.status = "completed"
          cachedData.message = "Extraction terminée avec succès"
          extractionsCache.set(extractionId, cachedData)
        }

        return NextResponse.json({
          id: extractionId,
          status: cachedData.status,
          votes: cachedData.votes,
          message: cachedData.message || "Extraction en cours...",
          demoMode: cachedData.demoMode,
          votesCount: cachedData.votes.length,
          progress,
        })
      }

      // Sinon, retourner les données telles quelles
      return NextResponse.json({
        id: extractionId,
        status: cachedData.status,
        votes: cachedData.votes,
        message: cachedData.message,
        demoMode: cachedData.demoMode,
        votesCount: cachedData.votes.length,
        progress: cachedData.status === "completed" ? 100 : 0,
      })
    }

    // Si nous n'avons pas de données en cache, simuler des données
    console.log(`Pas de données en cache pour ${extractionId}, simulation de données`)

    // Générer des votes simulés basés sur l'ID d'extraction
    const seed = extractionId.split("-")[1] || Date.now().toString()
    const numVotes = (Number.parseInt(seed) % 10) + 5 // Entre 5 et 15 votes

    // Simuler une progression basée sur le temps écoulé
    const startTime = Number.parseInt(seed)
    const elapsedTime = Date.now() - startTime
    const progress = Math.min(100, Math.floor((elapsedTime / 30000) * 100)) // 30 secondes pour compléter

    // Déterminer combien de votes ont été "extraits" jusqu'à présent
    const votesExtracted = Math.floor((progress / 100) * numVotes)

    // Générer les votes
    const votes: Vote[] = []
    for (let i = 0; i < votesExtracted; i++) {
      votes.push(createSimulatedVote(i, "Buildwise/E088/089", "2025-01-01", true))
    }

    // Déterminer le statut
    let status: "pending" | "in-progress" | "completed" | "failed" = "in-progress"
    if (progress >= 100) {
      status = "completed"
    } else if (progress < 5) {
      status = "pending"
    }

    // Stocker les données en cache
    extractionsCache.set(extractionId, {
      votes,
      lastUpdated: Date.now(),
      status,
      message: status === "completed" ? "Extraction terminée avec succès" : "Extraction en cours...",
      demoMode: true,
    })

    return NextResponse.json({
      id: extractionId,
      status,
      votes,
      startTime,
      endTime: status === "completed" ? Date.now() : undefined,
      message: status === "completed" ? "Extraction terminée avec succès" : "Extraction en cours...",
      demoMode: true,
      votesCount: votes.length,
      progress,
    })
  } catch (error: any) {
    console.error("Erreur lors de la récupération de l'extraction:", error)
    return NextResponse.json(
      { error: `Erreur lors de la récupération de l'extraction: ${error.message}` },
      { status: 500 },
    )
  }
}

// Fonction pour créer un vote simulé
function createSimulatedVote(index: number, commissionId: string, startDate: string, extractDetails: boolean): Vote {
  const closingDate = new Date(startDate || "2025-01-01")
  closingDate.setDate(closingDate.getDate() + index * 7 + Math.floor(Math.random() * 10))

  const openingDate = new Date(closingDate)
  openingDate.setDate(openingDate.getDate() - 30)

  const vote: Vote = {
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
    voteDetails: [],
  }

  // Ajouter des détails de vote si demandé
  if (extractDetails && vote.votes) {
    const numVoteDetails = Number.parseInt(vote.votes.split(" ")[0]) || 0
    const voteDetails: VoteDetail[] = []

    const countries = ["Belgium", "France", "Germany", "Netherlands", "Italy"]
    const voteOptions = ["Approve", "Approve with comments", "Disapprove", "Abstain"]

    for (let j = 0; j < numVoteDetails; j++) {
      const voteDate = new Date(vote.openingDate)
      voteDate.setDate(voteDate.getDate() + Math.floor(Math.random() * 20) + 1)

      voteDetails.push({
        participant: countries[j % countries.length],
        vote: vote.result === "Approved" ? voteOptions[0] : voteOptions[2],
        castBy: `User ${j + 1}`,
        date: voteDate.toISOString().split("T")[0],
      })
    }

    vote.voteDetails = voteDetails
  }

  return vote
}

// Endpoint pour recevoir des mises à jour de l'API Render
export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    console.log("Mise à jour reçue de l'API Render:", data)

    // Valider les données requises
    if (!data.extractionId) {
      return NextResponse.json({ error: "ID d'extraction manquant" }, { status: 400 })
    }

    // Récupérer ou créer l'entrée dans le cache
    const existingData = extractionsCache.get(data.extractionId) || {
      votes: [],
      lastUpdated: Date.now(),
      status: "in-progress" as const,
      demoMode: false,
    }

    // Mettre à jour l'extraction avec les nouvelles données
    if (data.votes && Array.isArray(data.votes)) {
      // Ajouter uniquement les nouveaux votes
      const existingIds = new Set(existingData.votes.map((v: Vote) => v.id))
      const newVotes = data.votes.filter((v: any) => !existingIds.has(v.id))

      existingData.votes.push(...newVotes)
      console.log(`Ajout de ${newVotes.length} nouveaux votes pour l'extraction ${data.extractionId}`)
    }

    // Mettre à jour le statut si fourni
    if (data.status) {
      existingData.status = data.status
    }

    // Mettre à jour le message si fourni
    if (data.message) {
      existingData.message = data.message
    }

    // Mettre à jour l'heure de dernière mise à jour
    existingData.lastUpdated = Date.now()

    // Enregistrer les modifications
    extractionsCache.set(data.extractionId, existingData)

    return NextResponse.json({
      success: true,
      message: "Extraction mise à jour avec succès",
    })
  } catch (error: any) {
    console.error("Erreur lors de la mise à jour de l'extraction:", error)
    return NextResponse.json(
      { error: `Erreur lors de la mise à jour de l'extraction: ${error.message}` },
      { status: 500 },
    )
  }
}
