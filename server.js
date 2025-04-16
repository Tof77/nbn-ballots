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

// Fonction pour capturer le HTML de la page pour le débogage
async function capturePageHtml(page, path) {
  const html = await page.content()
  const fs = require("fs")
  fs.writeFileSync(path, html)
  console.log(`HTML capturé et enregistré dans ${path}`)
}

// Fonction pour attendre un délai (compatible avec toutes les versions de Puppeteer)
async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Route principale pour l'extraction des votes
app.post("/api/extract-votes", async (req, res) => {
  console.log("Requête d'extraction reçue")
  let browser = null

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

    // Configuration de Puppeteer avec des options améliorées
    browser = await puppeteer.launch({
      headless: true, // Mettre à false pour le débogage visuel
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
        "--window-size=1920,1080",
      ],
      defaultViewport: { width: 1920, height: 1080 },
      timeout: 60000, // Timeout global de 60 secondes
    })

    try {
      const page = await browser.newPage()

      // Configurer les timeouts de navigation
      page.setDefaultNavigationTimeout(30000)
      page.setDefaultTimeout(30000)

      // Activer la journalisation de la console du navigateur
      page.on("console", (msg) => console.log("Console du navigateur:", msg.text()))

      // Intercepter les erreurs de page
      page.on("pageerror", (error) => {
        console.error("Erreur de page:", error.message)
      })

      // Naviguer vers la page de connexion
      console.log("Navigation vers isolutions.iso.org...")
      await page.goto("https://isolutions.iso.org/eballot/app/", {
        waitUntil: "networkidle2",
        timeout: 30000,
      })

      // Attendre un peu pour s'assurer que la page est complètement chargée
      await delay(3000)

      // Prendre une capture d'écran pour le débogage
      await page.screenshot({ path: "/tmp/login-page-before.png" })

      // Capturer le HTML pour le débogage
      await capturePageHtml(page, "/tmp/login-page-html.txt")

      // Se connecter
      console.log("Tentative de connexion...")

      // Vérifier si la page contient un iframe de connexion
      const hasLoginIframe = await page.evaluate(() => {
        return !!document.querySelector("iframe")
      })

      if (hasLoginIframe) {
        console.log("Iframe de connexion détecté, passage au contexte de l'iframe...")

        // Attendre que l'iframe soit chargé
        await page.waitForSelector("iframe", { timeout: 10000 })

        // Obtenir le premier iframe
        const frameHandle = await page.$("iframe")
        const frame = await frameHandle.contentFrame()

        // Attendre que les champs de connexion soient disponibles dans l'iframe
        await frame.waitForSelector("#username", { timeout: 10000 })
        await frame.waitForSelector("#password", { timeout: 10000 })

        // Remplir les champs de connexion dans l'iframe
        await frame.type("#username", username)
        await frame.type("#password", password)

        // Cliquer sur le bouton de connexion dans l'iframe
        await Promise.all([
          frame.click("#kc-login"),
          page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }),
        ])
      } else {
        // Essayer différentes combinaisons de sélecteurs pour les champs de connexion
        const usernameSelectors = ["#username", 'input[name="username"]', 'input[type="text"]', 'input[id="username"]']
        const passwordSelectors = [
          "#password",
          'input[name="password"]',
          'input[type="password"]',
          'input[id="password"]',
        ]
        const loginButtonSelectors = ["#kc-login", 'input[type="submit"]', 'button[type="submit"]', "button.submit"]

        let usernameSelector = null
        let passwordSelector = null
        let loginButtonSelector = null

        // Trouver les sélecteurs qui fonctionnent
        for (const selector of usernameSelectors) {
          if (await page.$(selector)) {
            usernameSelector = selector
            console.log(`Sélecteur de nom d'utilisateur trouvé: ${selector}`)
            break
          }
        }

        for (const selector of passwordSelectors) {
          if (await page.$(selector)) {
            passwordSelector = selector
            console.log(`Sélecteur de mot de passe trouvé: ${selector}`)
            break
          }
        }

        for (const selector of loginButtonSelectors) {
          if (await page.$(selector)) {
            loginButtonSelector = selector
            console.log(`Sélecteur de bouton de connexion trouvé: ${selector}`)
            break
          }
        }

        if (!usernameSelector || !passwordSelector || !loginButtonSelector) {
          // Prendre une capture d'écran pour le débogage
          await page.screenshot({ path: "/tmp/login-page-selectors-not-found.png" })

          // Capturer le HTML pour le débogage
          await capturePageHtml(page, "/tmp/login-page-selectors-not-found.html")

          throw new Error("Impossible de trouver les sélecteurs pour la page de connexion. HTML capturé pour analyse.")
        }

        // Remplir les champs de connexion
        await page.type(usernameSelector, username)
        await page.type(passwordSelector, password)

        // Cliquer sur le bouton de connexion et attendre la navigation
        await Promise.all([
          page.click(loginButtonSelector),
          page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }),
        ]).catch(async (error) => {
          console.error("Erreur lors de la navigation après connexion:", error)
          // Continuer quand même, car parfois la navigation ne se produit pas comme prévu
          await delay(5000)
        })
      }

      // Prendre une capture d'écran après la connexion
      await page.screenshot({ path: "/tmp/after-login.png" })

      // Capturer le HTML après la connexion
      await capturePageHtml(page, "/tmp/after-login-html.txt")

      // Vérifier si la connexion a réussi
      const isLoggedIn = await page.evaluate(() => {
        return (
          !document.querySelector("div.error-message") &&
          !document.querySelector(".alert-error") &&
          !document.querySelector(".login-error")
        )
      })

      if (!isLoggedIn) {
        throw new Error("Échec de la connexion. Vérifiez vos identifiants.")
      }

      console.log("Connexion réussie!")

      // Naviguer vers la page de recherche
      await page.goto("https://isolutions.iso.org/eballot/app/", {
        waitUntil: "networkidle2",
        timeout: 30000,
      })

      // Attendre que la page soit chargée
      await delay(3000)

      // Capturer l'état de la page avant la sélection de la commission
      await page.screenshot({ path: "/tmp/before-committee-selection.png" })
      await capturePageHtml(page, "/tmp/before-committee-selection.html")

      // Sélectionner la commission
      console.log(`Sélection de la commission: ${commissionId}`)

      // Attendre que le sélecteur de commission soit disponible
      await page.waitForSelector('select[name="committee"]', { timeout: 10000 }).catch(async (error) => {
        console.error("Erreur lors de l'attente du sélecteur de commission:", error)
        await page.screenshot({ path: "/tmp/committee-selector-error.png" })
        await capturePageHtml(page, "/tmp/committee-selector-error.html")
        throw new Error("Sélecteur de commission non trouvé")
      })

      await page.select('select[name="committee"]', commissionId)

      // Définir la date
      if (startDate) {
        console.log(`Définition de la date: ${startDate}`)
        await page.waitForSelector('input[name="closingDateFrom"]', { timeout: 10000 }).catch(async (error) => {
          console.error("Erreur lors de l'attente du sélecteur de date:", error)
          await page.screenshot({ path: "/tmp/date-selector-error.png" })
          await capturePageHtml(page, "/tmp/date-selector-error.html")
          throw new Error("Sélecteur de date non trouvé")
        })

        await page.evaluate((date) => {
          const input = document.querySelector('input[name="closingDateFrom"]')
          if (input) input.value = date
        }, startDate)
      }

      // Lancer la recherche
      console.log("Lancement de la recherche...")

      // Attendre que le bouton de recherche soit disponible
      await page.waitForSelector('button[type="submit"]', { timeout: 10000 }).catch(async (error) => {
        console.error("Erreur lors de l'attente du bouton de recherche:", error)
        await page.screenshot({ path: "/tmp/search-button-error.png" })
        await capturePageHtml(page, "/tmp/search-button-error.html")
        throw new Error("Bouton de recherche non trouvé")
      })

      await Promise.all([
        page.click('button[type="submit"]'),
        page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }),
      ]).catch(async (error) => {
        console.error("Erreur lors de la navigation après recherche:", error)
        // Continuer quand même, car parfois la navigation ne se produit pas comme prévu
        await delay(5000)
      })

      // Prendre une capture d'écran des résultats
      await page.screenshot({ path: "/tmp/search-results.png" })
      await capturePageHtml(page, "/tmp/search-results.html")

      // Attendre que le tableau des résultats soit chargé
      await page.waitForSelector("table.ballotList", { timeout: 10000 }).catch(() => {
        console.log("Tableau des résultats non trouvé, continuons quand même")
      })

      // Extraire les résultats
      console.log("Extraction des résultats...")
      const votes = await page.evaluate(() => {
        const results = []
        const rows = document.querySelectorAll("table.ballotList tr:not(:first-child)")

        rows.forEach((row, index) => {
          const cells = row.querySelectorAll("td")
          if (cells.length < 8) return

          const refElement = cells[2].querySelector("a")

          results.push({
            id: `vote-${index + 1}`,
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
              await page.goto(detailsLink, { waitUntil: "networkidle2", timeout: 30000 }).catch(async (error) => {
                console.error(`Erreur lors de la navigation vers les détails du vote ${vote.ref}:`, error)
                // Continuer avec le vote suivant
                return
              })

              // Attendre que la page de détails soit chargée
              await delay(2000)

              // Prendre une capture d'écran de la page de détails
              await page.screenshot({ path: `/tmp/vote-details-${i}.png` })

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
              await page.goBack({ waitUntil: "networkidle2", timeout: 30000 }).catch(async (error) => {
                console.error(`Erreur lors du retour à la page des résultats après le vote ${vote.ref}:`, error)
                // Naviguer directement vers la page des résultats
                await page.goto("https://isolutions.iso.org/eballot/app/", {
                  waitUntil: "networkidle2",
                  timeout: 30000,
                })
              })
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
      browser = null

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
      if (browser) {
        await browser.close()
        browser = null
      }

      return res.status(500).json({
        error: "Erreur lors de l'extraction des votes",
        details: error.message,
      })
    }
  } catch (error) {
    console.error("Erreur générale:", error)

    // S'assurer que le navigateur est fermé en cas d'erreur
    if (browser) {
      await browser.close()
      browser = null
    }

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
