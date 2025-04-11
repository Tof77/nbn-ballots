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

// Fonction pour extraire le code de commission (ex: E323, E125, etc.)
function extractCommissionCode(commissionId: string): string {
  // Rechercher un pattern comme E123, E456, etc.
  const match = commissionId.match(/E\d+/)
  return match ? match[0] : "E000"
}

// Fonction pour générer des références de documents basées sur la commission
function generateDocumentRef(commissionCode: string, index: number): string {
  const codeNumber = commissionCode.substring(1) // Enlever le 'E'
  const baseNumber = Number.parseInt(codeNumber) || 100

  // Différents formats selon le type de commission
  if (baseNumber >= 300) {
    return `ISO/DIS ${baseNumber + index}-${Math.floor(Math.random() * 5) + 1}`
  } else if (baseNumber >= 200) {
    return `ISO/CD ${baseNumber + index}`
  } else if (baseNumber >= 100) {
    return `EN ${baseNumber + index}`
  } else {
    return `prEN ${baseNumber + 1000 + index}`
  }
}

// Fonction pour générer des titres de documents basés sur la commission
function generateDocumentTitle(commissionCode: string, index: number): string {
  const codeNumber = Number.parseInt(commissionCode.substring(1)) || 0

  const domains: Record<string, string[]> = {
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
  const domainTitles = domains[domainKey]

  // Sélectionner un titre de base et ajouter un suffixe spécifique
  const baseTitleIndex = index % domainTitles.length
  const baseTitle = domainTitles[baseTitleIndex]

  return `${baseTitle} - Part ${(index % 5) + 1}: ${["Terminology", "Requirements", "Test methods", "Performance criteria", "Implementation guidelines"][index % 5]}`
}

export async function POST(req: NextRequest) {
  try {
    const { commissionId, startDate, extractDetails = true, credentials } = await req.json()

    // Vérifier que les identifiants chiffrés sont fournis
    if (!credentials || !credentials.encryptedUsername || !credentials.encryptedPassword) {
      return NextResponse.json({ error: "Identifiants chiffrés manquants" }, { status: 400 })
    }

    let username, password

    try {
      // Déchiffrer les identifiants simulés
      username = simulateDecryption(credentials.encryptedUsername)
      password = simulateDecryption(credentials.encryptedPassword)

      // Ne pas utiliser les identifiants, juste vérifier qu'ils sont déchiffrés correctement
      console.log("Identifiants déchiffrés avec succès")
    } catch (error) {
      // Au lieu de renvoyer une erreur, utilisons des valeurs par défaut pour la démo
      console.log("Utilisation d'identifiants de démonstration")
      username = "demo_user"
      password = "demo_password"
    }

    // Extraire le nom de la commission et le code
    let commissionName = "Commission inconnue"
    if (commissionId) {
      if (commissionId.includes("Buildwise-SECO/E")) {
        commissionName = commissionId.split("=").pop() || ""
        commissionName = `Buildwise-SECO/${commissionName.split("/").pop() || ""}`
      } else if (commissionId.includes("Buildwise/E")) {
        commissionName = commissionId.split("=").pop() || ""
        commissionName = `Buildwise/${commissionName.split("/").pop() || ""}`
      }
    }

    // Extraire le code de la commission (ex: E323)
    const commissionCode = extractCommissionCode(commissionName)

    // Générer des données de test
    const votes = []
    // Nombre de votes basé sur le code de commission (pour plus de cohérence)
    const codeNumber = Number.parseInt(commissionCode.substring(1)) || 0
    const numVotes = Math.min(Math.max(5, Math.floor(codeNumber / 30)), 15) // Entre 5 et 15 votes

    // Utiliser une date par défaut si startDate n'est pas fourni
    const baseDate = startDate ? new Date(startDate) : new Date()

    for (let i = 0; i < numVotes; i++) {
      const closingDate = new Date(baseDate)
      closingDate.setDate(closingDate.getDate() + Math.floor(Math.random() * 60)) // Ajouter entre 0 et 60 jours

      const openingDate = new Date(closingDate)
      openingDate.setDate(openingDate.getDate() - 30) // 30 jours avant la clôture

      const vote = {
        id: `${commissionCode.toLowerCase()}-${i + 1}`,
        ref: generateDocumentRef(commissionCode, i),
        title: generateDocumentTitle(commissionCode, i),
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

    return NextResponse.json({ votes })
  } catch (error) {
    console.error("Erreur:", error)
    return NextResponse.json({ error: "Erreur lors de l'extraction des votes" }, { status: 500 })
  }
}
