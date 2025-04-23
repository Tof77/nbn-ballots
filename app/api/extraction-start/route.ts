import { type NextRequest, NextResponse } from "next/server"
import crypto from "crypto"

// Définir le runtime Node.js pour cette route API
export const runtime = "nodejs"
// Définir la durée maximale d'exécution à 60 secondes
export const maxDuration = 60

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

// Fonction pour générer un jeton simple
function generateToken(extractionId: string): string {
  // Dans une implémentation réelle, vous utiliseriez une bibliothèque comme jsonwebtoken
  // Pour l'instant, utilisons une méthode simple
  return Buffer.from(`${extractionId}:${Date.now()}:secret-key`).toString("base64")
}

export async function POST(req: NextRequest) {
  try {
    const requestData = await req.json()
    console.log("Démarrage de l'extraction avec les paramètres:", {
      ...requestData,
      credentials: requestData.credentials ? "***HIDDEN***" : undefined,
    })

    // Valider les données requises
    if (!requestData.commissionId || !requestData.startDate || !requestData.credentials) {
      return NextResponse.json(
        { error: "Paramètres manquants (commissionId, startDate, credentials)" },
        { status: 400 },
      )
    }

    // Générer un ID d'extraction unique
    const extractionId = generateExtractionId()
    console.log(`ID d'extraction généré: ${extractionId}`)

    // Si le mode démo est forcé, générer immédiatement des données simulées
    if (requestData.forceDemoMode) {
      console.log("Mode démo forcé, génération de données simulées")
      // Générer quelques votes simulés immédiatement
      const initialVotes = Array.from({ length: 3 }, (_, i) =>
        createSimulatedVote(i, requestData.commissionId, requestData.startDate, requestData.extractDetails),
      )

      return NextResponse.json({
        extractionId,
        status: "in-progress",
        message: "Extraction démarrée en mode démo",
        votes: initialVotes,
        demoMode: true,
        token: generateToken(extractionId),
      })
    }

    // Pour une extraction réelle, essayer d'appeler l'API Render
    const renderApiUrl = process.env.RENDER_API_URL
    console.log(`URL de l'API Render: ${renderApiUrl || "non définie"}`)

    if (!renderApiUrl) {
      console.log("RENDER_API_URL non définie, fallback en mode démo")
      // Fallback en mode démo si l'API Render n'est pas configurée
      const initialVotes = Array.from({ length: 2 }, (_, i) =>
        createSimulatedVote(i, requestData.commissionId, requestData.startDate, requestData.extractDetails),
      )

      return NextResponse.json({
        extractionId,
        status: "in-progress",
        message: "Extraction démarrée en mode démo (API Render non configurée)",
        votes: initialVotes,
        demoMode: true,
        token: generateToken(extractionId),
      })
    }

    try {
      // Tester si l'API Render est accessible
      console.log(`Ping de l'API Render: ${renderApiUrl}/ping`)
      const pingResponse = await fetch(`${renderApiUrl}/ping`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
        signal: AbortSignal.timeout(10000), // 10 secondes
      })

      console.log(`Réponse du ping: ${pingResponse.status} ${pingResponse.statusText}`)

      if (!pingResponse.ok) {
        console.log(`L'API Render a répondu avec un statut ${pingResponse.status}, fallback en mode démo`)
        // Fallback en mode démo si l'API Render n'est pas accessible
        const initialVotes = Array.from({ length: 2 }, (_, i) =>
          createSimulatedVote(i, requestData.commissionId, requestData.startDate, requestData.extractDetails),
        )

        return NextResponse.json({
          extractionId,
          status: "in-progress",
          message: `Extraction démarrée en mode démo (API Render non accessible: ${pingResponse.status})`,
          votes: initialVotes,
          demoMode: true,
          token: generateToken(extractionId),
        })
      }

      // Appeler l'API Render pour démarrer l'extraction
      console.log(`Appel de l'API Render pour l'extraction: ${renderApiUrl}/api/extract-votes`)

      // Préparer les données pour l'API Render
      const renderRequestData = {
        ...requestData,
        extractionId,
        callbackUrl: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000",
      }

      console.log("Données envoyées à l'API Render:", {
        ...renderRequestData,
        credentials: "***HIDDEN***",
      })

      const response = await fetch(`${renderApiUrl}/api/extract-votes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
        body: JSON.stringify(renderRequestData),
        signal: AbortSignal.timeout(30000), // 30 secondes
      })

      console.log(`Réponse de l'API Render: ${response.status} ${response.statusText}`)

      if (!response.ok) {
        console.log(`L'API Render a répondu avec une erreur ${response.status}, fallback en mode démo`)
        // Fallback en mode démo si l'API Render répond avec une erreur
        const initialVotes = Array.from({ length: 2 }, (_, i) =>
          createSimulatedVote(i, requestData.commissionId, requestData.startDate, requestData.extractDetails),
        )

        return NextResponse.json({
          extractionId,
          status: "in-progress",
          message: `Extraction démarrée en mode démo (erreur API Render: ${response.status})`,
          votes: initialVotes,
          demoMode: true,
          token: generateToken(extractionId),
          renderError: `Statut HTTP: ${response.status}`,
        })
      }

      // Lire la réponse de l'API Render
      const data = await response.json()
      console.log("Données reçues de l'API Render:", data)

      // Retourner les données initiales de l'API Render
      return NextResponse.json({
        extractionId,
        status: "in-progress",
        message: "Extraction démarrée via l'API Render",
        votes: data.votes || [],
        demoMode: false,
        token: generateToken(extractionId),
        renderResponse: data,
      })
    } catch (error: any) {
      console.error("Erreur lors de l'appel à l'API Render:", error)

      // En cas d'erreur, passer en mode démo
      const initialVotes = Array.from({ length: 2 }, (_, i) =>
        createSimulatedVote(i, requestData.commissionId, requestData.startDate, requestData.extractDetails),
      )

      return NextResponse.json({
        extractionId,
        status: "in-progress",
        message: `Extraction démarrée en mode démo (erreur: ${error.message})`,
        votes: initialVotes,
        demoMode: true,
        token: generateToken(extractionId),
        error: error.message,
      })
    }
  } catch (error: any) {
    console.error("Erreur générale:", error)
    return NextResponse.json({ error: `Erreur lors du démarrage de l'extraction: ${error.message}` }, { status: 500 })
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
