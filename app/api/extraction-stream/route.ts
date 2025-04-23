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

// Type pour le statut d'extraction
type ExtractionStatus = "pending" | "in-progress" | "completed" | "failed"

// Map pour stocker temporairement les données d'extraction
// Note: Cette map sera réinitialisée à chaque redéploiement ou redémarrage
const extractionsCache = new Map<
  string,
  {
    votes: Vote[]
    lastUpdated: number
    status: ExtractionStatus
    message?: string
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
        votesCount: cachedData.votes.length,
        progress: cachedData.status === "completed" ? 100 : 0,
      })
    }

    // Si nous n'avons pas de données en cache, retourner une erreur
    return NextResponse.json(
      {
        error: "Extraction non trouvée ou expirée",
        message: "Aucune donnée disponible pour cette extraction. Veuillez réessayer.",
      },
      { status: 404 },
    )
  } catch (error: any) {
    console.error("Erreur lors de la récupération de l'extraction:", error)
    return NextResponse.json(
      { error: `Erreur lors de la récupération de l'extraction: ${error.message}` },
      { status: 500 },
    )
  }
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
      status: "in-progress" as ExtractionStatus,
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
