import { type NextRequest, NextResponse } from "next/server"

// Définir le runtime Node.js pour cette route API
export const runtime = "nodejs"
// Définir la durée maximale d'exécution à 30 secondes
export const maxDuration = 30

// Référence à la map d'extractions définie dans extraction-start
// Note: Dans une implémentation réelle, vous utiliseriez une base de données ou Redis
// pour partager les données entre les routes API
declare global {
  var extractionsMap: Map<
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
  >
}

// Initialiser la map globale si elle n'existe pas
if (!global.extractionsMap) {
  global.extractionsMap = new Map()
}

export async function GET(req: NextRequest) {
  try {
    // Récupérer l'ID d'extraction depuis les paramètres de requête
    const { searchParams } = new URL(req.url)
    const extractionId = searchParams.get("id")

    if (!extractionId) {
      return NextResponse.json({ error: "ID d'extraction manquant" }, { status: 400 })
    }

    // Récupérer l'extraction
    const extraction = global.extractionsMap.get(extractionId)

    if (!extraction) {
      return NextResponse.json({ error: "Extraction non trouvée" }, { status: 404 })
    }

    // Retourner l'état actuel de l'extraction
    return NextResponse.json({
      id: extraction.id,
      status: extraction.status,
      votes: extraction.votes,
      startTime: extraction.startTime,
      endTime: extraction.endTime,
      message: extraction.message,
      demoMode: extraction.demoMode,
      votesCount: extraction.votes.length,
    })
  } catch (error: any) {
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

    // Valider les données requises
    if (!data.extractionId) {
      return NextResponse.json({ error: "ID d'extraction manquant" }, { status: 400 })
    }

    // Récupérer l'extraction
    const extraction = global.extractionsMap.get(data.extractionId)

    if (!extraction) {
      return NextResponse.json({ error: "Extraction non trouvée" }, { status: 404 })
    }

    // Mettre à jour l'extraction avec les nouvelles données
    if (data.votes && Array.isArray(data.votes)) {
      // Ajouter uniquement les nouveaux votes
      const existingIds = new Set(extraction.votes.map((v: any) => v.id))
      const newVotes = data.votes.filter((v: any) => !existingIds.has(v.id))

      extraction.votes.push(...newVotes)
    }

    // Mettre à jour le statut si fourni
    if (data.status) {
      extraction.status = data.status
    }

    // Mettre à jour le message si fourni
    if (data.message) {
      extraction.message = data.message
    }

    // Mettre à jour l'heure de fin si l'extraction est terminée
    if (data.status === "completed" || data.status === "failed") {
      extraction.endTime = Date.now()
    }

    // Enregistrer les modifications
    global.extractionsMap.set(data.extractionId, extraction)

    return NextResponse.json({
      success: true,
      message: "Extraction mise à jour avec succès",
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: `Erreur lors de la mise à jour de l'extraction: ${error.message}` },
      { status: 500 },
    )
  }
}
