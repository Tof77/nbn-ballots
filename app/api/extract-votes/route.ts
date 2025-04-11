import { type NextRequest, NextResponse } from "next/server"
import { chromium } from "playwright-core"

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

export const config = {
  runtime: "nodejs",
  maxDuration: 60, // 60 secondes
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
      console.log("API - Identifiants déchiffrés avec succès")
    } catch (error) {
      console.error("API - Erreur lors du déchiffrement:", error)
      return NextResponse.json(
        {
          error: "Échec du déchiffrement des identifiants",
          details: error instanceof Error ? error.message : String(error),
        },
        { status: 400 },
      )
    }

    console.log("API - Connexion à isolutions.iso.org avec Playwright...")

    // Lancer le navigateur
    const browser = await chromium.launch({
      headless: true,
    })

    try {
      const context = await browser.newContext()
      const page = await context.newPage()

      // Naviguer vers la page de connexion
      console.log("API - Navigation vers la page de connexion...")
      await page.goto("https://isolutions.iso.org/eballot/app/")

      // Attendre que la page de connexion soit chargée
      await page.waitForSelector('input[name="username"]')
      console.log("API - Page de connexion chargée")

      // Remplir le formulaire de connexion
      await page.fill('input[name="username"]', username)
      await page.fill('input[name="password"]', password)
      console.log("API - Identifiants saisis")

      // Soumettre le formulaire
      await Promise.all([page.click('button[type="submit"]'), page.waitForNavigation()])
      console.log("API - Connexion réussie")

      // Vérifier si la connexion a réussi
      const isLoggedIn = await page.evaluate(() => {
        return !document.querySelector('input[name="username"]')
      })

      if (!isLoggedIn) {
        throw new Error("Échec de la connexion - Identifiants incorrects ou page de connexion non reconnue")
      }

      // Naviguer vers la page de recherche des votes
      console.log("API - Navigation vers la page de recherche des votes...")
      await page.goto("https://isolutions.iso.org/eballot/app/")

      // Sélectionner la commission
      if (commissionId) {
        console.log("API - Sélection de la commission:", commissionId)
        await page.selectOption('select[name="committee"]', commissionId)
      }

      // Définir la date de début si fournie
      if (startDate) {
        console.log("API - Définition de la date de début:", startDate)
        await page.evaluate((date) => {
          const input = document.querySelector('input[name="closingDateFrom"]')
          if (input) {
            // @ts-ignore
            input.value = date
          }
        }, startDate)
      }

      // Cliquer sur le bouton de recherche
      console.log("API - Lancement de la recherche...")
      await Promise.all([page.click('button[type="submit"]'), page.waitForNavigation()])

      // Extraire les résultats
      console.log("API - Extraction des résultats...")
      const votes = await page.evaluate((extractVoteDetails) => {
        const results: any[] = []
        const rows = document.querySelectorAll("table.ballotList tr:not(:first-child)")

        rows.forEach((row) => {
          const cells = row.querySelectorAll("td")
          if (cells.length < 8) return // Ignorer les lignes sans suffisamment de cellules

          const refElement = cells[2].querySelector("a")
          const ref = refElement ? refElement.textContent?.trim() || "" : ""
          const title = refElement ? refElement.getAttribute("title") || "" : ""

          const vote = {
            id: `vote-${Math.random().toString(36).substring(2, 10)}`,
            ref,
            title,
            committee: cells[1].textContent?.trim() || "",
            votes: cells[3].textContent?.trim() || "",
            result: cells[4].textContent?.trim() || "",
            status: cells[5].textContent?.trim() || "",
            openingDate: cells[6].textContent?.trim() || "",
            closingDate: cells[7].textContent?.trim() || "",
            role: cells[8]?.textContent?.trim() || "",
            sourceType: cells[9]?.textContent?.trim() || "",
            source: cells[10]?.textContent?.trim() || "",
            voteDetails: [],
          }

          results.push(vote)
        })

        return results
      }, extractDetails)

      console.log("API - Nombre de votes extraits:", votes.length)

      // Si demandé, extraire les détails de chaque vote
      if (extractDetails && votes.length > 0) {
        console.log("API - Extraction des détails des votes...")
        for (let i = 0; i < votes.length; i++) {
          const vote = votes[i]
          console.log(`API - Extraction des détails pour le vote ${i + 1}/${votes.length}: ${vote.ref}`)

          // Cliquer sur le lien du vote pour accéder aux détails
          await page.goto(`https://isolutions.iso.org/eballot/app/ballot/${vote.id}`)

          // Extraire les détails du vote
          const voteDetails = await page.evaluate(() => {
            const details: any[] = []
            const rows = document.querySelectorAll("table.voteDetails tr:not(:first-child)")

            rows.forEach((row) => {
              const cells = row.querySelectorAll("td")
              if (cells.length < 4) return

              details.push({
                participant: cells[0].textContent?.trim() || "",
                vote: cells[1].textContent?.trim() || "",
                castBy: cells[2].textContent?.trim() || "",
                date: cells[3].textContent?.trim() || "",
              })
            })

            return details
          })

          vote.voteDetails = voteDetails
        }
      }

      console.log("API - Extraction terminée avec succès")
      return NextResponse.json({
        votes,
        debug: {
          receivedCommissionId: commissionId,
          extractedVotes: votes.length,
        },
      })
    } finally {
      // Fermer le navigateur
      await browser.close()
      console.log("API - Navigateur fermé")
    }
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
