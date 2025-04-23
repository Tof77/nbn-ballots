import { type NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 60

// Interface pour l'état d'extraction
interface ExtractionState {
  id: string
  status: "pending" | "in-progress" | "completed" | "failed"
  progress?: number
  message?: string
  startTime: number
  endTime?: number
  result?: any
}

// Store global pour stocker l'état des extractions
// Utiliser une Map pour stocker les extractions par ID
const extractionStore = new Map<string, ExtractionState>()

// Fonction pour nettoyer les anciennes extractions
function cleanupExtractionStore() {
  const now = Date.now()
  const MAX_AGE = 24 * 60 * 60 * 1000 // 24 heures

  // Utiliser Array.from pour convertir les entrées en tableau avant d'itérer
  Array.from(extractionStore.entries()).forEach(([id, extraction]) => {
    if (now - extraction.startTime > MAX_AGE) {
      extractionStore.delete(id)
    }
  })
}

// Fonction pour générer un ID unique
function generateExtractionId() {
  return `extract-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

// Fonction pour créer une nouvelle extraction
function createExtraction(id: string): ExtractionState {
  const extraction: ExtractionState = {
    id,
    status: "pending",
    startTime: Date.now(),
    progress: 0,
    message: "Extraction en attente de démarrage",
  }
  extractionStore.set(id, extraction)
  return extraction
}

// Fonction pour mettre à jour l'état d'une extraction
function updateExtraction(
  id: string,
  updates: Partial<Omit<ExtractionState, "id" | "startTime">>,
): ExtractionState | null {
  const extraction = extractionStore.get(id)
  if (!extraction) return null

  const updatedExtraction = { ...extraction, ...updates }
  extractionStore.set(id, updatedExtraction)
  return updatedExtraction
}

// Fonction pour récupérer l'état d'une extraction
function getExtraction(id: string): ExtractionState | null {
  return extractionStore.get(id) || null
}

// Fonction pour compléter une extraction
function completeExtraction(id: string, result: any): ExtractionState | null {
  return updateExtraction(id, {
    status: "completed",
    endTime: Date.now(),
    progress: 100,
    message: "Extraction terminée avec succès",
    result,
  })
}

// Fonction pour marquer une extraction comme échouée
function failExtraction(id: string, message: string): ExtractionState | null {
  return updateExtraction(id, {
    status: "failed",
    endTime: Date.now(),
    message,
  })
}

export async function GET(request: NextRequest) {
  // Nettoyer les anciennes extractions
  cleanupExtractionStore()

  // Récupérer l'ID de l'extraction depuis les paramètres de requête
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")

  // Si aucun ID n'est fourni, retourner toutes les extractions
  if (!id) {
    const extractions = Array.from(extractionStore.values())
    return NextResponse.json(extractions)
  }

  // Récupérer l'état de l'extraction
  const extraction = getExtraction(id)
  if (!extraction) {
    return NextResponse.json({ error: "Extraction non trouvée" }, { status: 404 })
  }

  return NextResponse.json(extraction)
}

export async function POST(request: NextRequest) {
  // Nettoyer les anciennes extractions
  cleanupExtractionStore()

  try {
    // Récupérer les données de la requête
    const data = await request.json()
    const { commissionId, startDate, extractDetails, credentials } = data

    // Vérifier que les données requises sont présentes
    if (!commissionId) {
      return NextResponse.json({ error: "Commission manquante" }, { status: 400 })
    }

    // Générer un ID unique pour cette extraction
    const extractionId = data.extractionId || generateExtractionId()

    // Créer une nouvelle extraction
    const extraction = createExtraction(extractionId)

    // Mettre à jour l'état de l'extraction
    updateExtraction(extractionId, {
      status: "in-progress",
      progress: 10,
      message: "Préparation de l'extraction",
    })

    // Récupérer l'URL de l'API Render depuis les variables d'environnement
    const renderApiUrl = process.env.RENDER_API_URL

    if (!renderApiUrl) {
      return failExtraction(extractionId, "L'URL de l'API Render n'est pas configurée (RENDER_API_URL manquante)")
    }

    // Préparer les données à envoyer à l'API Render
    const requestData = {
      commissionId,
      startDate,
      extractDetails,
      credentials,
      extractionId,
      callbackUrl: process.env.VERCEL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.VERCEL_CALLBACK_URL || process.env.RENDER_CALLBACK_URL || null,
    }

    // Mettre à jour l'état de l'extraction
    updateExtraction(extractionId, {
      status: "in-progress",
      progress: 20,
      message: "Envoi de la requête à l'API Render",
    })

    // Envoyer la requête à l'API Render de manière asynchrone
    // Nous ne voulons pas attendre la réponse ici, car cela pourrait prendre du temps
    // et nous voulons retourner rapidement l'ID de l'extraction au client
    fetch(`${renderApiUrl}/extract-votes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestData),
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Erreur lors de l'extraction: ${response.status} ${response.statusText} - ${errorText}`)
        }
        return response.json()
      })
      .then((result) => {
        // Mettre à jour l'état de l'extraction avec les résultats
        completeExtraction(extractionId, result)
      })
      .catch((error) => {
        // Marquer l'extraction comme échouée
        failExtraction(extractionId, `Erreur lors de l'extraction: ${error.message}`)
      })

    // Retourner l'ID de l'extraction au client
    return NextResponse.json({
      extractionId,
      status: "in-progress",
      message: "Extraction démarrée",
    })
  } catch (error) {
    console.error("Erreur lors du traitement de la requête:", error)
    return NextResponse.json(
      {
        error: "Erreur lors du traitement de la requête",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
