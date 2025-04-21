import { type NextRequest, NextResponse } from "next/server"

// Définir le runtime Node.js pour cette route API
export const runtime = "nodejs"

// Map pour stocker les mises à jour de progression
const progressUpdates = new Map<string, any[]>()

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    const { extractionId, status, message, progress, timestamp } = data

    if (!extractionId) {
      return NextResponse.json(
        {
          error: "ID d'extraction manquant",
        },
        { status: 400 },
      )
    }

    // Stocker la mise à jour de progression
    if (!progressUpdates.has(extractionId)) {
      progressUpdates.set(extractionId, [])
    }

    progressUpdates.get(extractionId)!.push({
      status,
      message,
      progress,
      timestamp,
    })

    // Limiter le nombre de mises à jour stockées
    if (progressUpdates.get(extractionId)!.length > 100) {
      progressUpdates.get(extractionId)!.shift()
    }

    return NextResponse.json({
      success: true,
      message: "Mise à jour de progression reçue",
    })
  } catch (error: any) {
    console.error("Erreur lors de la réception de la mise à jour de progression:", error)
    return NextResponse.json(
      {
        error: "Erreur lors de la réception de la mise à jour de progression",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const extractionId = searchParams.get("id")

  if (!extractionId) {
    return NextResponse.json(
      {
        error: "ID d'extraction manquant",
      },
      { status: 400 },
    )
  }

  const updates = progressUpdates.get(extractionId) || []

  return NextResponse.json({
    extractionId,
    updates,
  })
}
