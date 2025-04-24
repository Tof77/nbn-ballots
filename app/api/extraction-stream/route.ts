import { type NextRequest, NextResponse } from "next/server"

// Définir le runtime Node.js pour cette route API
export const runtime = "nodejs"

// Interface pour les données d'extraction
interface ExtractionData {
  extractionId: string
  status: "pending" | "in-progress" | "completed" | "failed"
  message?: string
  votes?: any[]
  progress?: number
  error?: string
}

// Map pour stocker les extractions en cours
const extractionsMap = new Map<string, ExtractionData>()

export async function POST(req: NextRequest): Promise<Response> {
  try {
    // Récupérer les données depuis le corps de la requête
    const data = (await req.json()) as ExtractionData

    // Valider les données
    if (!data.extractionId) {
      return NextResponse.json({ error: "ID d'extraction manquant" }, { status: 400 })
    }

    // Journaliser la réception des données
    console.log(`Mise à jour de l'extraction reçue pour ${data.extractionId}:`, {
      status: data.status,
      message: data.message,
      votesCount: data.votes?.length || 0,
      progress: data.progress,
    })

    // Récupérer l'extraction existante ou en créer une nouvelle
    const existingExtraction = extractionsMap.get(data.extractionId) || {
      extractionId: data.extractionId,
      status: "pending",
      votes: [],
    }

    // Mettre à jour le statut et le message
    existingExtraction.status = data.status
    if (data.message) existingExtraction.message = data.message
    if (data.progress !== undefined) existingExtraction.progress = data.progress
    if (data.error) existingExtraction.error = data.error

    // Ajouter les votes s'il y en a
    if (data.votes && data.votes.length > 0) {
      existingExtraction.votes = [...(existingExtraction.votes || []), ...data.votes]
      console.log(`Ajout de ${data.votes.length} votes à l'extraction ${data.extractionId}`)
    }

    // Stocker l'extraction mise à jour
    extractionsMap.set(data.extractionId, existingExtraction)

    // Nettoyer les extractions terminées après un certain temps
    if (data.status === "completed" || data.status === "failed") {
      setTimeout(() => {
        if (extractionsMap.has(data.extractionId)) {
          console.log(`Suppression de l'extraction terminée ${data.extractionId}`)
          extractionsMap.delete(data.extractionId)
        }
      }, 3600000) // 1 heure
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Erreur lors du traitement de la mise à jour de l'extraction:", error)
    return NextResponse.json(
      {
        error: `Erreur lors du traitement de la mise à jour: ${error instanceof Error ? error.message : String(error)}`,
      },
      { status: 500 },
    )
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  try {
    // Récupérer l'ID d'extraction depuis les paramètres de requête
    const { searchParams } = new URL(req.url)
    const extractionId = searchParams.get("id")

    if (!extractionId) {
      // Si aucun ID n'est fourni, retourner toutes les extractions (pour le débogage)
      const allExtractions = Array.from(extractionsMap.values())
      return NextResponse.json({
        extractions: allExtractions,
        count: allExtractions.length,
        timestamp: new Date().toISOString(),
      })
    }

    // Récupérer l'extraction spécifique
    const extraction = extractionsMap.get(extractionId)

    if (!extraction) {
      return NextResponse.json(
        {
          error: "Extraction non trouvée",
          extractionId,
        },
        { status: 404 },
      )
    }

    return NextResponse.json(extraction)
  } catch (error) {
    console.error("Erreur lors de la récupération de l'extraction:", error)
    return NextResponse.json(
      {
        error: `Erreur lors de la récupération de l'extraction: ${error instanceof Error ? error.message : String(error)}`,
      },
      { status: 500 },
    )
  }
}
