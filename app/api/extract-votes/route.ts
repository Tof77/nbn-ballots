import { type NextRequest, NextResponse } from "next/server"

// Définir le runtime Node.js pour cette route API
export const runtime = "nodejs"
// Augmenter la durée maximale d'exécution à 120 secondes
export const maxDuration = 120

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

interface ScreenshotInfo {
  name: string
  url: string
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
  } catch (error: any) {
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
    const requestText = await req.text()
    diagnostics.push(`Données brutes reçues (longueur): ${requestText.length}`)
    console.log("API - Données brutes reçues (longueur):", requestText.length)

    // Parser les données JSON
    let requestData: any
    try {
      requestData = JSON.parse(requestText)
    } catch (error: any) {
      console.error("API - Erreur lors du parsing JSON:", error)
      diagnostics.push(`Erreur lors du parsing JSON: ${error instanceof Error ? error.message : String(error)}`)
      return NextResponse.json(
        {
          error: "Format de données invalide",
          details: "Les données reçues ne sont pas un JSON valide",
          receivedData: requestText.substring(0, 100) + "...", // Afficher les 100 premiers caractères
          diagnostics,
        },
        { status: 400 },
      )
    }

    // Vérifier si le mode démo est forcé
    const forceDemoMode = requestData.forceDemoMode === true
    if (forceDemoMode) {
      diagnostics.push("Mode démo forcé par l'utilisateur")
      console.log("API - Mode démo forcé par l'utilisateur")
    }

    // Journaliser les données reçues (sans les identifiants sensibles)
    const sanitizedData = {
      ...requestData,
      credentials: requestData.credentials
        ? {
            encryptedUsername: "***HIDDEN***",
            encryptedPassword: "***HIDDEN***",
          }
        : undefined,
    }
    diagnostics.push(`Données reçues: ${JSON.stringify(sanitizedData, null, 2)}`)
    console.log("API - Données reçues:", JSON.stringify(sanitizedData, null, 2))

    // URL de votre API Render
    const renderApiUrl = process.env.RENDER_API_URL
    diagnostics.push(`RENDER_API_URL: ${renderApiUrl || "non définie"}`)
    console.log("API - RENDER_API_URL:", renderApiUrl)

    // Vérifier si l'API Render est configurée et si le mode démo n'est pas forcé
    if (!renderApiUrl || forceDemoMode) {
      if (!renderApiUrl) {
        diagnostics.push("RENDER_API_URL non définie, utilisation des données simulées")
        console.log("API - RENDER_API_URL non définie, utilisation des données simulées")
      }
      // Continuer avec le mode de secours
    } else {
      try {
        diagnostics.push(`Tentative d'appel à l'API Render: ${renderApiUrl}/api/extract-votes`)
        console.log("API - Tentative d'appel à l'API Render:", `${renderApiUrl}/api/extract-votes`)

        // Tester d'abord si l'API Render est accessible
        try {
          diagnostics.push("Ping de l'API Render...")
          const pingStartTime = Date.now()
          const pingResponse = await fetch(`${renderApiUrl}/ping?cache=${Date.now()}`, {
            method: "GET",
            headers: {
              Accept: "application/json",
              "Cache-Control": "no-cache, no-store, must-revalidate",
              Pragma: "no-cache",
              Expires: "0",
            },
            // Ajouter un timeout pour éviter d'attendre trop longtemps
            signal: AbortSignal.timeout(15000), // 15 secondes
          })
          const pingDuration = Date.now() - pingStartTime
          diagnostics.push(`Ping Render status: ${pingResponse.status} (${pingDuration}ms)`)
          console.log("API - Ping Render status:", pingResponse.status, `(${pingDuration}ms)`)

          // Essayer de lire le corps de la réponse pour plus d'informations
          try {
            const pingText = await pingResponse.text()
            diagnostics.push(`Ping Render response: ${pingText.substring(0, 200)}${pingText.length > 200 ? "..." : ""}`)
          } catch (pingBodyError: any) {
            diagnostics.push(
              `Erreur lors de la lecture du corps du ping: ${pingBodyError instanceof Error ? pingBodyError.message : String(pingBodyError)}`,
            )
          }

          // Vérifier si le service est en maintenance (503)
          if (pingResponse.status === 503) {
            diagnostics.push("L'API Render est en maintenance (503), utilisation des données simulées")
            console.log("API - L'API Render est en maintenance (503), utilisation des données simulées")
            throw new Error("L'API Render est en maintenance (503)")
          }

          if (!pingResponse.ok) {
            diagnostics.push(
              `L'API Render n'est pas accessible (status ${pingResponse.status}), utilisation des données simulées`,
            )
            console.log("API - L'API Render n'est pas accessible, utilisation des données simulées")
            throw new Error(`L'API Render n'est pas accessible (status ${pingResponse.status})`)
          }
        } catch (pingError: any) {
          diagnostics.push(
            `Erreur lors du ping de l'API Render: ${pingError instanceof Error ? pingError.message : String(pingError)}`,
          )
          console.error("API - Erreur lors du ping de l'API Render:", pingError)
          throw new Error(
            `Erreur lors du ping de l'API Render: ${pingError instanceof Error ? pingError.message : String(pingError)}`,
          )
        }

        // Ajouter une note concernant la possibilité d'une fenêtre GDPR
        diagnostics.push(
          "Note: Si l'API ne répond pas, il est possible qu'une fenêtre de confirmation GDPR soit affichée sur le serveur Render.",
        )

        // Appeler l'API Render avec un timeout plus long pour l'opération principale
        diagnostics.push("Appel à l'API Render pour l'extraction des votes...")
        const extractStartTime = Date.now()
        try {
          // Ajouter un timeout plus long pour l'extraction
          const controller = new AbortController()
          const timeoutId = setTimeout(() => {
            diagnostics.push("Timeout manuel déclenché après 60 secondes")
            controller.abort(new Error("Timeout manuel après 60 secondes"))
          }, 60000) // 60 secondes

          // Ajouter un paramètre de cache-buster pour éviter les réponses en cache
          const timestamp = Date.now()
          const urlWithCacheBuster = `${renderApiUrl}/api/extract-votes?cache=${timestamp}`

          const response = await fetch(urlWithCacheBuster, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-cache, no-store, must-revalidate",
              Pragma: "no-cache",
              Expires: "0",
            },
            body: JSON.stringify({
              ...requestData,
              // Ajouter un paramètre pour indiquer que c'est une requête depuis Vercel
              fromVercel: true,
              vercelTimestamp: timestamp,
            }),
            signal: controller.signal,
          })

          // Nettoyer le timeout
          clearTimeout(timeoutId)

          const extractDuration = Date.now() - extractStartTime
          diagnostics.push(
            `Statut de la réponse Render: ${response.status} ${response.statusText} (${extractDuration}ms)`,
          )
          console.log(
            "API - Statut de la réponse Render:",
            response.status,
            response.statusText,
            `(${extractDuration}ms)`,
          )

          // Vérifier si le service est en maintenance (503)
          if (response.status === 503) {
            diagnostics.push("L'API Render est en maintenance (503), utilisation des données simulées")
            console.log("API - L'API Render est en maintenance (503), utilisation des données simulées")
            throw new Error("L'API Render est en maintenance (503)")
          }

          // Récupérer la réponse avec un timeout pour la lecture du corps
          const responseTextPromise = response.text()
          const responseTextTimeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error("Timeout lors de la lecture du corps de la réponse")), 10000)
          })

          const responseText = (await Promise.race([responseTextPromise, responseTextTimeoutPromise])) as string

          diagnostics.push(`Longueur de la réponse Render: ${responseText.length}`)
          console.log("API - Longueur de la réponse Render:", responseText.length)

          let responseData: any
          try {
            responseData = JSON.parse(responseText)
          } catch (error: any) {
            diagnostics.push(
              `Erreur lors du parsing de la réponse JSON: ${error instanceof Error ? error.message : String(error)}`,
            )
            diagnostics.push(`Début de la réponse: ${responseText.substring(0, 500)}...`)
            console.error("API - Erreur lors du parsing de la réponse JSON:", error)
            return NextResponse.json(
              {
                error: "Format de réponse invalide",
                details: "La réponse de l'API externe n'est pas un JSON valide",
                receivedResponse: responseText.substring(0, 500) + "...", // Afficher les 500 premiers caractères
                diagnostics,
                renderApiUrl,
              },
              { status: 502 },
            )
          }

          if (!response.ok) {
            diagnostics.push(`Erreur de l'API Render: ${JSON.stringify(responseData, null, 2)}`)
            console.error("API - Erreur de l'API Render:", responseData)
            return NextResponse.json(
              {
                error: "Erreur de l'API Render",
                details: responseData.error || `Statut HTTP: ${response.status}`,
                renderApiUrl,
                diagnostics,
                responseData,
              },
              { status: 502 },
            )
          }

          diagnostics.push("Réponse de l'API Render reçue avec succès")
          console.log("API - Réponse de l'API Render reçue avec succès")

          // Ajouter les diagnostics à la réponse
          if (!responseData.diagnostics) {
            responseData.diagnostics = diagnostics
          } else {
            responseData.diagnostics = [
              ...diagnostics,
              "--- Diagnostics de l'API Render ---",
              ...responseData.diagnostics,
            ]
          }

          // Vérifier si la réponse contient des URLs de captures d'écran
          if (responseData.debug?.screenshotUrls) {
            diagnostics.push(`${responseData.debug.screenshotUrls.length} captures d'écran disponibles`)
            console.log(`API - ${responseData.debug.screenshotUrls.length} captures d'écran disponibles`)
          }

          return NextResponse.json(responseData)
        } catch (error: any) {
          // Vérifier si c'est une erreur de timeout ou d'abandon
          const isTimeoutError =
            error.name === "AbortError" ||
            error.name === "TimeoutError" ||
            error.message.includes("aborted") ||
            error.message.includes("timeout") ||
            error.message.includes("Timeout")

          if (isTimeoutError) {
            diagnostics.push("L'opération a expiré (timeout). L'extraction prend trop de temps.")
            console.error("API - Timeout lors de l'appel à l'API Render:", error)

            // Détection du mode de démonstration suite au timeout
            diagnostics.push(
              `Détection du mode de démonstration suite à l'erreur: ${error instanceof Error ? error.message : String(error)}`,
            )
            diagnostics.push("Activation du mode de démonstration avec données simulées")
            console.log("API - Activation du mode de démonstration avec données simulées suite au timeout")
            // Continuer avec le mode de secours
          } else {
            diagnostics.push(
              `Erreur lors de l'appel à l'API Render: ${error instanceof Error ? error.message : String(error)}`,
            )
            console.error("API - Erreur lors de l'appel à l'API Render:", error)
            diagnostics.push("Utilisation des données simulées en fallback")
            console.log("API - Utilisation des données simulées en fallback")
            // Continuer avec le mode de secours
          }
        }
      } catch (error: any) {
        diagnostics.push(
          `Erreur lors de l'appel à l'API Render: ${error instanceof Error ? error.message : String(error)}`,
        )
        console.error("API - Erreur lors de l'appel à l'API Render:", error)
        diagnostics.push("Utilisation des données simulées en fallback")
        console.log("API - Utilisation des données simulées en fallback")
        // Continuer avec le mode de secours
      }
    }

    // Si l'API Render n'est pas disponible ou si une erreur s'est produite, utiliser les données simulées
    const { commissionId, startDate, extractDetails = true, credentials } = requestData

    // Vérifier que les identifiants chiffrés sont fournis
    if (!credentials || !credentials.encryptedUsername || !credentials.encryptedPassword) {
      diagnostics.push("Identifiants chiffrés manquants")
      console.error("API - Identifiants chiffrés manquants")
      return NextResponse.json(
        {
          error: "Identifiants chiffrés manquants",
          receivedData: sanitizedData,
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
      console.log("API - Identifiants déchiffrés avec succès")
    } catch (error: any) {
      diagnostics.push(`Erreur lors du déchiffrement: ${error instanceof Error ? error.message : String(error)}`)
      console.error("API - Erreur lors du déchiffrement:", error)
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
    console.log("API - Code de commission extrait:", commissionCode)

    // Simuler une connexion à isolutions.iso.org
    diagnostics.push("Simulation de connexion à isolutions.iso.org...")
    console.log("API - Simulation de connexion à isolutions.iso.org...")
    diagnostics.push(`Utilisateur: ${username}, Commission: ${commissionId}, Date: ${startDate}`)
    console.log(`API - Utilisateur: ${username}, Commission: ${commissionId}, Date: ${startDate}`)

    // Générer des données réalistes basées sur la capture d'écran fournie
    const votes: Vote[] = []

    // Créer un tableau pour simuler des URLs de captures d'écran
    const simulatedScreenshots: ScreenshotInfo[] = [
      { name: "Page initiale", url: "https://render-api.example.com/screenshots/simulated-initial-page.png" },
      { name: "Page de connexion", url: "https://render-api.example.com/screenshots/simulated-login-page.png" },
      { name: "Après connexion", url: "https://render-api.example.com/screenshots/simulated-after-login.png" },
      { name: "Page de recherche", url: "https://render-api.example.com/screenshots/simulated-search-page.png" },
      {
        name: "Résultats de recherche",
        url: "https://render-api.example.com/screenshots/simulated-search-results.png",
      },
    ]

    // Si la commission est E088/089, utiliser les données de la capture d'écran
    if (commissionCode === "E088/089") {
      diagnostics.push("MODE DÉMONSTRATION: Génération de données pour E088/089 basées sur la capture d'écran")
      console.log("API - MODE DÉMONSTRATION: Génération de données pour E088/089 basées sur la capture d'écran")

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
      diagnostics.push(`MODE DÉMONSTRATION: Génération de données simulées pour la commission ${commissionCode}`)
      console.log(`API - MODE DÉMONSTRATION: Génération de données simulées pour la commission ${commissionCode}`)

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

    diagnostics.push(`Nombre de votes générés: ${votes.length}`)
    console.log("API - Nombre de votes générés:", votes.length)

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
        screenshotUrls: simulatedScreenshots, // Ajouter les URLs simulées des captures d'écran
      },
      diagnostics,
      renderApiStatus: "unavailable",
      renderApiMessage: "L'API Render n'est pas disponible. Utilisation du mode démonstration avec données simulées.",
    })
  } catch (error: any) {
    const totalDuration = Date.now() - startTime
    diagnostics.push(`Durée totale jusqu'à l'erreur: ${totalDuration}ms`)
    diagnostics.push(`Erreur générale: ${error instanceof Error ? error.message : String(error)}`)
    console.error("API - Erreur générale:", error)
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
