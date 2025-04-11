import { type NextRequest, NextResponse } from "next/server"

// Fonction pour déchiffrer les données simulées
function simulateDecryption(encryptedData: string): string {
  try {
    // Décodage base64 et vérification du préfixe "demo:"
    const decoded = atob(encryptedData)
    if (!decoded.startsWith("demo:")) {
      throw new Error("Format de données invalide")
    }
    return decoded.substring(5) // Enlever le préfixe "demo:"
  } catch (error) {
    console.error("Erreur lors du déchiffrement simulé:", error)
    throw new Error("Échec du déchiffrement des données")
  }
}

// Fonction pour journaliser les données reçues (sans les identifiants sensibles)
function logRequestData(data: any) {
  const sanitizedData = {
    ...data,
    credentials: data.credentials
      ? {
          encryptedUsername: "***HIDDEN***",
          encryptedPassword: "***HIDDEN***",
        }
      : undefined,
  }
  console.log("API - Données reçues:", JSON.stringify(sanitizedData, null, 2))
  return sanitizedData
}

export async function POST(req: NextRequest) {
  try {
    // Récupérer et journaliser les données brutes
    const requestText = await req.text()
    console.log("API - Données brutes reçues:", requestText)

    // Parser les données JSON
    let requestData
    try {
      requestData = JSON.parse(requestText)
    } catch (error) {
      console.error("API - Erreur lors du parsing JSON:", error)
      return NextResponse.json(
        {
          error: "Format de données invalide",
          details: "Les données reçues ne sont pas un JSON valide",
          receivedData: requestText.substring(0, 100) + "...", // Afficher les 100 premiers caractères
        },
        { status: 400 },
      )
    }

    // Journaliser les données reçues (sans les identifiants sensibles)
    const sanitizedData = logRequestData(requestData)

    const { commissionId, startDate, extractDetails = true, credentials } = requestData

    // Vérifier que les identifiants chiffrés sont fournis
    if (!credentials || !credentials.encryptedUsername || !credentials.encryptedPassword) {
      console.error("API - Identifiants chiffrés manquants")
      return NextResponse.json(
        {
          error: "Identifiants chiffrés manquants",
          receivedData: sanitizedData,
        },
        { status: 400 },
      )
    }

    let username, password

    try {
      // Déchiffrer les identifiants simulés
      username = simulateDecryption(credentials.encryptedUsername)
      password = simulateDecryption(credentials.encryptedPassword)
      console.log("API - Identifiants déchiffrés avec succès")
    } catch (error) {
      console.error("API - Erreur lors du déchiffrement:", error)
      // Au lieu de renvoyer une erreur, utilisons des valeurs par défaut pour la démo
      console.log("API - Utilisation d'identifiants de démonstration")
      username = "demo_user"
      password = "demo_password"
    }

    // Extraire le nom de la commission
    console.log("API - Commission ID reçu:", commissionId)
    let commissionName = "Commission inconnue"
    let commissionCode = "E000"

    if (commissionId) {
      // Extraire le nom de la commission à partir de l'ID
      if (commissionId.includes("Buildwise-SECO/E")) {
        const parts = commissionId.split("/")
        commissionName = `Buildwise-SECO/${parts[parts.length - 1]}`
      } else if (commissionId.includes("Buildwise/E")) {
        const parts = commissionId.split("/")
        commissionName = `Buildwise/${parts[parts.length - 1]}`
      } else if (commissionId.includes("E")) {
        // Rechercher un pattern comme E123, E456, etc.
        const match = commissionId.match(/E\d+/)
        if (match) {
          commissionCode = match[0]
          commissionName = `Commission ${commissionCode}`
        }
      }

      // Extraire le code de la commission (ex: E323)
      const codeMatch = commissionName.match(/E\d+/)
      if (codeMatch) {
        commissionCode = codeMatch[0]
      }
    }

    console.log("API - Nom de commission extrait:", commissionName)
    console.log("API - Code de commission extrait:", commissionCode)

    // Générer des données de test
    const votes = []
    // Nombre de votes basé sur le code de commission (pour plus de cohérence)
    const codeNumber = Number.parseInt(commissionCode.substring(1)) || 0
    const numVotes = Math.min(Math.max(5, Math.floor(codeNumber / 30)), 15) // Entre 5 et 15 votes
    console.log("API - Génération de", numVotes, "votes pour la commission", commissionCode)

    // Utiliser une date par défaut si startDate n'est pas fourni
    const baseDate = startDate ? new Date(startDate) : new Date()
    console.log("API - Date de base:", baseDate.toISOString())

    for (let i = 0; i < numVotes; i++) {
      const closingDate = new Date(baseDate)
      closingDate.setDate(closingDate.getDate() + Math.floor(Math.random() * 60)) // Ajouter entre 0 et 60 jours

      const openingDate = new Date(closingDate)
      openingDate.setDate(openingDate.getDate() - 30) // 30 jours avant la clôture

      // Générer une référence de document basée sur le code de commission
      let docRef
      if (codeNumber >= 300) {
        docRef = `ISO/DIS ${codeNumber + i}-${Math.floor(Math.random() * 5) + 1}`
      } else if (codeNumber >= 200) {
        docRef = `ISO/CD ${codeNumber + i}`
      } else if (codeNumber >= 100) {
        docRef = `EN ${codeNumber + i}`
      } else {
        docRef = `prEN ${codeNumber + 1000 + i}`
      }

      // Générer un titre de document basé sur le code de commission
      const domains = {
        E323: [
          "Building Information Modeling (BIM)",
          "Digital twins for built environment",
          "Information management using building information modelling",
          "Organization and digitization of information about buildings",
          "Common data environment (CDE) for information exchange",
        ],
        E125: [
          "Masonry structures design requirements",
          "Test methods for masonry units",
          "Specification for masonry units",
          "Methods of test for mortar for masonry",
          "Specification for ancillary components for masonry",
        ],
        E250: [
          "Thermal performance of buildings",
          "Energy performance of buildings",
          "Thermal insulation products for buildings",
          "Sustainability of construction works",
          "Assessment of energy performance of buildings",
        ],
        default: [
          "Construction materials and building",
          "Test methods for construction products",
          "Specifications for building components",
          "Performance requirements for structures",
          "Assessment methods for building materials",
        ],
      }

      // Sélectionner le domaine approprié ou utiliser le domaine par défaut
      const domainKey = Object.keys(domains).find((key) => commissionCode.includes(key)) || "default"
      const domainTitles = domains[domainKey as keyof typeof domains]

      // Sélectionner un titre de base et ajouter un suffixe spécifique
      const baseTitleIndex = i % domainTitles.length
      const baseTitle = domainTitles[baseTitleIndex]
      const docTitle = `${baseTitle} - Part ${(i % 5) + 1}: ${
        ["Terminology", "Requirements", "Test methods", "Performance criteria", "Implementation guidelines"][i % 5]
      }`

      const vote = {
        id: `${commissionCode.toLowerCase()}-${i + 1}`,
        ref: docRef,
        title: docTitle,
        committee: commissionName,
        votes: `${Math.floor(Math.random() * 10) + 5}/${Math.floor(Math.random() * 10) + 10}`,
        result: Math.random() > 0.3 ? "Approved" : "Disapproved",
        status: Math.random() > 0.2 ? "Closed" : "Ongoing",
        openingDate: openingDate.toISOString().split("T")[0],
        closingDate: closingDate.toISOString().split("T")[0],
        role: Math.random() > 0.5 ? "P-Member" : "O-Member",
        sourceType: Math.random() > 0.5 ? "ISO" : "CEN",
        source: `ISO/TC ${Math.floor(Math.random() * 300) + 1}/SC ${Math.floor(Math.random() * 20) + 1}`,
        voteDetails: [],
      }

      // Ajouter des détails de vote si demandé
      if (extractDetails) {
        const numDetails = Math.floor(Math.random() * 5) + 2 // Entre 2 et 7 détails
        const countries = ["Belgium", "France", "Germany", "Netherlands", "Italy", "Spain", "UK", "Sweden", "Norway"]
        const voteOptions = ["Approve", "Approve with comments", "Disapprove", "Abstain"]

        for (let j = 0; j < numDetails; j++) {
          const voteDate = new Date(openingDate)
          voteDate.setDate(voteDate.getDate() + Math.floor(Math.random() * 30)) // Vote entre l'ouverture et la clôture

          vote.voteDetails.push({
            participant: countries[Math.floor(Math.random() * countries.length)],
            vote: voteOptions[Math.floor(Math.random() * voteOptions.length)],
            castBy: `User ${Math.floor(Math.random() * 1000) + 1}`,
            date: voteDate.toISOString().split("T")[0],
          })
        }
      }

      votes.push(vote)
    }

    console.log("API - Votes générés:", votes.length)
    return NextResponse.json({
      votes,
      debug: {
        receivedCommissionId: commissionId,
        extractedCommissionName: commissionName,
        extractedCommissionCode: commissionCode,
        numVotesGenerated: numVotes,
      },
    })
  } catch (error) {
    console.error("API - Erreur générale:", error)
    return NextResponse.json(
      {
        error: "Erreur lors de l'extraction des votes",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
