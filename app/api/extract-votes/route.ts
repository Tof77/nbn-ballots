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

    // Générer des données de test basées sur les paramètres fournis
    const commissionName = commissionId?.includes("E323")
      ? "Buildwise/E323"
      : commissionId?.includes("E125")
        ? "Buildwise-SECO/E125"
        : "Commission inconnue"

    // Générer des données de test
    const votes = []
    const numVotes = Math.floor(Math.random() * 10) + 5 // Entre 5 et 15 votes

    // Utiliser une date par défaut si startDate n'est pas fourni
    const baseDate = startDate ? new Date(startDate) : new Date()

    for (let i = 0; i < numVotes; i++) {
      const closingDate = new Date(baseDate)
      closingDate.setDate(closingDate.getDate() + Math.floor(Math.random() * 60)) // Ajouter entre 0 et 60 jours

      const openingDate = new Date(closingDate)
      openingDate.setDate(openingDate.getDate() - 30) // 30 jours avant la clôture

      const vote = {
        id: `sample-${i + 1}`,
        ref: `ISO/DIS ${19650 + i}-${Math.floor(Math.random() * 5) + 1}`,
        title: `Exemple de document normatif ${i + 1}`,
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
