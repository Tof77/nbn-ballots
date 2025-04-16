const express = require("express")
const cors = require("cors")
const puppeteer = require("puppeteer")
const app = express()
const port = process.env.PORT || 3000

// Activer CORS pour permettre les requêtes depuis votre application Vercel
app.use(cors())
app.use(express.json())

// Route de test pour vérifier que l'API fonctionne
app.get("/", (req, res) => {
  res.json({ status: "API NBN Ballots opérationnelle" })
})

// Fonction pour déchiffrer les données simulées
function simulateDecryption(encryptedData) {
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

// Fonction pour extraire le code de commission (ex: E088/089)
function extractCommissionCode(commissionId) {
  // Rechercher un pattern comme E088/089, E123, etc.
  if (commissionId.includes("Buildwise/E")) {
    const parts = commissionId.split("/")
    return parts[parts.length - 1]
  } else if (commissionId.includes("E")) {
    return commissionId
  }
  return "Unknown"
}

// Route principale pour l'extraction des votes
app.post("/api/extract-votes", async (req, res) => {
  console.log("Requête d'extraction reçue")

  try {
    const { commissionId, startDate, extractDetails = true, credentials } = req.body

    // Vérifier que les identifiants chiffrés sont fournis
    if (!credentials || !credentials.encryptedUsername || !credentials.encryptedPassword) {
      console.error("Identifiants chiffrés manquants")
      return res.status(400).json({
        error: "Identifiants chiffrés manquants",
      })
    }

    let username, password

    try {
      // Déchiffrer les identifiants simulés
      username = simulateDecryption(credentials.encryptedUsername)
      password = simulateDecryption(credentials.encryptedPassword)
      console.log("Identifiants déchiffrés avec succès")
    } catch (error) {
      console.error("Erreur lors du déchiffrement:", error)
      return res.status(400).json({
        error: "Échec du déchiffrement des identifiants",
        details: error.message,
      })
    }

    // Extraire le code de commission
    const commissionCode = extractCommissionCode(commissionId)
    console.log("Code de commission extrait:", commissionCode)

    // Lancer Puppeteer pour l'extraction
    console.log("Lancement de Puppeteer...")

    // Avec l'image Docker, nous n'avons pas besoin de spécifier des arguments spéciaux
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    })

    try {
      const page = await browser.newPage()

      // Naviguer vers la page de connexion
      console.log("Navigation vers isolutions.iso.org...")
      await page.goto("https://isolutions.iso.org/eballot/app/", { waitUntil: "networkidle2" })

      // Prendre une capture d'écran pour le débogage
      await page.screenshot({ path: "/tmp/login-page.png" })

      // Se connecter
      console.log("Tentative de connexion...")
      // Mise à jour des sélecteurs pour la page de connexion ISO
      await page.type("#username", username)
      await page.type("#password", password)

      // Cliquer sur le bouton de connexion et attendre la navigation
      // Utiliser le sélecteur correct pour le bouton de connexion
      await Promise.all([page.click("#kc-login"), page.waitForNavigation({ waitUntil: "networkidle2" })])

      // Prendre une capture d'écran après la connexion
      await page.screenshot({ path: "/tmp/after-login.png" })

      // Vérifier si la connexion a réussi
      const isLoggedIn = await page.evaluate(() => {
        return !document.querySelector("div.error-message")
      })

      if (!isLoggedIn) {
        throw new Error("Échec de la connexion. Vérifiez vos identifiants.")
      }

      console.log("Connexion réussie!")

      // Naviguer vers la page de recherche
      await page.goto("https://isolutions.iso.org/eballot/app/", { waitUntil: "networkidle2" })

      // Sélectionner la commission
      console.log(`Sélection de la commission: ${commissionId}`)
      await page.select('select[name="committee"]', commissionId)

      // Définir la date
      if (startDate) {
        console.log(`Définition de la date: ${startDate}`)
        await page.evaluate((date) => {
          const input = document.querySelector('input[name="closingDateFrom"]')
          if (input) input.value = date
        }, startDate)
      }

      // Lancer la recherche
      console.log("Lancement de la recherche...")
      await Promise.all([page.click('button[type="submit"]'), page.waitForNavigation({ waitUntil: "networkidle2" })])

      // Prendre une capture d'écran des résultats
      await page.screenshot({ path: "/tmp/search-results.png" })

      // Attendre que le tableau des résultats soit chargé
      await page.waitForSelector("table.ballotList", { timeout: 10000 }).catch(() => {
        console.log("Tableau des résultats non trouvé, continuons quand même")
      })

      // Extraire les résultats
      console.log("Extraction des résultats...")
      const votes = await page.evaluate(() => {
        const results = []
        const rows = document.querySelectorAll("table.ballotList tr:not(:first-child)")

        rows.forEach((row) => {
          const cells = row.querySelectorAll("td")
          if (cells.length < 8) return

          const refElement = cells[2].querySelector("a")

          results.push({
            ref: refElement ? refElement.textContent.trim() : "",
            title: refElement ? refElement.getAttribute("title") : "",
            committee: cells[1].textContent.trim(),
            votes: cells[3].textContent.trim(),
            result: cells[4].textContent.trim(),
            status: cells[5].textContent.trim(),
            openingDate: cells[6].textContent.trim(),
            closingDate: cells[7].textContent.trim(),
            role: cells[8] ? cells[8].textContent.trim() : "",
            sourceType: cells[9] ? cells[9].textContent.trim() : "",
            source: cells[10] ? cells[10].textContent.trim() : "",
          })
        })

        return results
      })

      console.log(`${votes.length} votes extraits`)

      // Extraire les détails des votes si demandé
      if (extractDetails && votes.length > 0) {
        console.log("Extraction des détails des votes...")

        for (let i = 0; i < votes.length; i++) {
          const vote = votes[i]

          // Vérifier si le vote a des détails à extraire
          if (vote.votes && vote.votes.includes("vote")) {
            console.log(`Extraction des détails pour le vote ${i + 1}/${votes.length}: ${vote.ref}`)

            // Trouver le lien vers les détails du vote
            const detailsLink = await page.evaluate((voteRef) => {
              const links = Array.from(
                document.querySelectorAll("table.ballotList tr:not(:first-child) td:nth-child(3) a"),
              )
              const link = links.find((link) => link.textContent.trim() === voteRef)
              return link ? link.href : null
            }, vote.ref)

            if (detailsLink) {
              // Naviguer vers la page de détails
              await page.goto(detailsLink, { waitUntil: "networkidle2" })

              // Extraire les détails
              vote.voteDetails = await page.evaluate(() => {
                const details = []
                const rows = document.querySelectorAll("table.voteList tr:not(:first-child)")

                rows.forEach((row) => {
                  const cells = row.querySelectorAll("td")
                  if (cells.length < 4) return

                  details.push({
                    participant: cells[0].textContent.trim(),
                    vote: cells[1].textContent.trim(),
                    castBy: cells[2].textContent.trim(),
                    date: cells[3].textContent.trim(),
                  })
                })

                return details
              })

              console.log(`${vote.voteDetails.length} détails extraits pour le vote ${vote.ref}`)

              // Revenir à la page des résultats
              await page.goBack()
            } else {
              console.log(`Lien de détails non trouvé pour le vote ${vote.ref}`)
              vote.voteDetails = []
            }
          } else {
            vote.voteDetails = []
          }
        }
      }

      // Fermer le navigateur
      await browser.close()

      // Retourner les résultats
      return res.json({
        votes,
        debug: {
          receivedCommissionId: commissionId,
          extractedCommissionCode: commissionCode,
          username: username,
          startDate: startDate,
          numVotesGenerated: votes.length,
        },
      })
    } catch (error) {
      console.error("Erreur lors de l'extraction:", error)

      // Fermer le navigateur en cas d'erreur
      await browser.close()

      return res.status(500).json({
        error: "Erreur lors de l'extraction des votes",
        details: error.message,
      })
    }
  } catch (error) {
    console.error("Erreur générale:", error)
    return res.status(500).json({
      error: "Erreur lors de l'extraction des votes",
      details: error.message,
    })
  }
})

// Démarrer le serveur
app.listen(port, () => {
  console.log(`API NBN Ballots en écoute sur le port ${port}`)
})
