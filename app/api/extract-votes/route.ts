import { type NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { decryptCredentials } from "@/utils/encryption"

// Définir le runtime pour utiliser NodeJS au lieu de Edge
export const runtime = "nodejs"

// URL de base pour les appels à l'API Render
const RENDER_API_URL =
  process.env.RENDER_API_URL || process.env.RENDER_SERVICE_URL || "https://nbn-ballots-render.onrender.com"

// Durée maximale d'une extraction (en millisecondes)
const EXTRACTION_TIMEOUT = 300000 // 5 minutes

// Map pour stocker l'état des extractions
interface ExtractionState {
  id: string
  status: "pending" | "in-progress" | "completed" | "failed"
  progress?: number
  message?: string
  startTime: number
  endTime?: number
  result?: any
  error?: string
  diagnostics?: string[]
}

// Structure pour stocker la progression et l'état des extractions
const extractionStore = new Map<string, ExtractionState>()

// Créer un ID unique pour chaque extraction
function generateExtractionId(): string {
  return crypto.randomBytes(16).toString("hex")
}

// Récupérer l'état complet d'une extraction
function getExtractionState(id: string): ExtractionState | null {
  if (!extractionStore.has(id)) {
    return null
  }
  return extractionStore.get(id) || null
}

// Mettre à jour l'état d'une extraction
function updateExtractionState(id: string, updates: Partial<Omit<ExtractionState, "id">>): ExtractionState {
  const currentState = extractionStore.get(id)
  if (!currentState) {
    throw new Error(`Extraction ${id} not found`)
  }

  const updatedState = {
    ...currentState,
    ...updates,
  }

  extractionStore.set(id, updatedState)
  return updatedState
}

// Créer une nouvelle extraction
function createExtraction(requestData: any): ExtractionState {
  const id = generateExtractionId()
  const extraction: ExtractionState = {
    id,
    status: "pending",
    startTime: Date.now(),
    message: "Extraction en attente de démarrage",
  }

  extractionStore.set(id, extraction)
  return extraction
}

// Nettoyer le store des extractions trop anciennes (plus de 24h)
function cleanupExtractionStore() {
  const now = Date.now()
  const MAX_AGE = 24 * 60 * 60 * 1000 // 24 heures

  for (const [id, extraction] of extractionStore.entries()) {
    if (now - extraction.startTime > MAX_AGE) {
      extractionStore.delete(id)
    }
  }
}

// Route GET pour vérifier l'état d'une extraction
export async function GET(req: NextRequest) {
  // Nettoyer le store des extractions trop anciennes
  cleanupExtractionStore()

  // Récupérer l'ID d'extraction de la query string
  const id = req.nextUrl.searchParams.get("id")

  // Si aucun ID n'est fourni, retourner la liste des extractions
  if (!id) {
    const extractions = Array.from(extractionStore.values()).map((extraction) => ({
      id: extraction.id,
      status: extraction.status,
      startTime: extraction.startTime,
      endTime: extraction.endTime,
    }))

    return NextResponse.json(extractions)
  }

  // Récupérer l'état de l'extraction
  const extraction = getExtractionState(id)
  if (!extraction) {
    return NextResponse.json({ error: `Extraction ${id} not found` }, { status: 404 })
  }

  // Retourner l'état de l'extraction
  return NextResponse.json(extraction)
}

// Route POST pour démarrer une nouvelle extraction
export async function POST(req: NextRequest) {
  try {
    // Nettoyer le store des extractions trop anciennes
    cleanupExtractionStore()

    // Récupérer les données de la requête
    const requestData = await req.json()

    // Vérifier que les données nécessaires sont présentes
    if (!requestData.commissionId || !requestData.credentials) {
      return NextResponse.json({ error: "Données manquantes (commissionId ou credentials)" }, { status: 400 })
    }

    // Déchiffrer les identifiants
    const { encryptedUsername, encryptedPassword } = requestData.credentials
    let decryptedUsername: string
    let decryptedPassword: string

    try {
      const decrypted = await decryptCredentials(encryptedUsername, encryptedPassword)
      decryptedUsername = decrypted.decryptedUsername
      decryptedPassword = decrypted.decryptedPassword
    } catch (error: unknown) {
      console.error("Erreur lors du déchiffrement des identifiants:", error)
      return NextResponse.json(
        {
          error: "Impossible de déchiffrer les identifiants",
          details: error instanceof Error ? error.message : String(error),
        },
        { status: 400 },
      )
    }

    // Si l'ID d'extraction est fourni, vérifier l'état de l'extraction
    const extractionId = req.nextUrl.searchParams.get("id")

    // Si un ID est fourni, on vérifie si l'extraction existe
    if (extractionId && extractionStore.has(extractionId)) {
      const extraction = getExtractionState(extractionId)
      return NextResponse.json(extraction)
    }

    // Créer une nouvelle extraction
    const extraction = createExtraction(requestData)

    // Lancer l'extraction en asynchrone
    startExtraction(extraction.id, requestData, decryptedUsername, decryptedPassword)

    // Retourner immédiatement l'ID d'extraction
    return NextResponse.json({
      extractionId: extraction.id,
      status: extraction.status,
      message: "Extraction lancée avec succès",
    })
  } catch (error: unknown) {
    console.error("Erreur lors du démarrage de l'extraction:", error)
    return NextResponse.json(
      {
        error: "Erreur lors du démarrage de l'extraction",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}

// Fonction pour lancer l'extraction en asynchrone
async function startExtraction(extractionId: string, requestData: any, username: string, password: string) {
  try {
    // Mettre à jour l'état de l'extraction
    updateExtractionState(extractionId, {
      status: "in-progress",
      progress: 0,
      message: "Connexion au service d'extraction",
    })

    // Préparer les données à envoyer au service Render
    const renderData = {
      ...requestData,
      credentials: {
        username,
        password,
      },
    }

    console.log(`Démarrage de l'extraction ${extractionId}...`)

    // Appeler l'API Render pour effectuer l'extraction
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT)

    try {
      // Mise à jour de l'état
      updateExtractionState(extractionId, {
        progress: 10,
        message: "Envoi de la requête au service d'extraction",
      })

      // Appel à l'API Render
      const response = await fetch(`${RENDER_API_URL}/extract-votes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Extraction-ID": extractionId,
        },
        body: JSON.stringify(renderData),
        signal: controller.signal,
      })

      // Annuler le timeout
      clearTimeout(timeoutId)

      // Mise à jour de l'état
      updateExtractionState(extractionId, {
        progress: 50,
        message: "Traitement des résultats de l'extraction",
      })

      // Vérifier si la réponse est OK
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Erreur ${response.status}: ${errorText}`)
      }

      // Récupérer les résultats
      const result = await response.json()

      // Mise à jour de l'état final
      updateExtractionState(extractionId, {
        status: "completed",
        progress: 100,
        message: "Extraction terminée avec succès",
        endTime: Date.now(),
        result,
      })

      console.log(`Extraction ${extractionId} terminée avec succès`)
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  } catch (error: unknown) {
    console.error(`Erreur lors de l'extraction ${extractionId}:`, error)

    // Mettre à jour l'état de l'extraction avec l'erreur
    updateExtractionState(extractionId, {
      status: "failed",
      message: `Échec de l'extraction: ${error instanceof Error ? error.message : String(error)}`,
      endTime: Date.now(),
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
