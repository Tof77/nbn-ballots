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
  return html
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

      // Naviguer directement vers la page principale d'ISO
      console.log("Navigation vers isolutions.iso.org...")
      await page.goto("https://isolutions.iso.org", {
        waitUntil: "networkidle2",
        timeout: 30000,
      })

      // Attendre un peu pour s'assurer que la page est chargée
      await delay(5000)

      // Prendre une capture d'écran pour le débogage
      await page.screenshot({ path: "/tmp/initial-page.png" })

      // Capturer l'URL actuelle pour voir si nous sommes redirigés vers la page de connexion
      const currentUrl = page.url()
      console.log(`URL actuelle: ${currentUrl}`)

      // Vérifier si nous sommes sur la page de connexion (URL contient idp.iso.org)
      const isOnLoginPage = currentUrl.includes("idp.iso.org")
      console.log(`Sur la page de connexion: ${isOnLoginPage}`)

      if (isOnLoginPage) {
        console.log("Page de connexion détectée, tentative de connexion...")

        // Prendre une capture d'écran de la page de connexion
        await page.screenshot({ path: "/tmp/login-page.png" })
        await capturePageHtml(page, "/tmp/login-page.html")

        // Attendre que les champs de connexion soient chargés
        await delay(3000)

        // Trouver les champs de connexion
        const usernameSelector = await page.evaluate(() => {
          const selectors = [
            "#username",
            'input[name="username"]',
            'input[type="text"]',
            'input[id="username"]',
            'input[placeholder*="user"]',
          ]
          for (const selector of selectors) {
            if (document.querySelector(selector)) return selector
          }
          return null
        })

        const passwordSelector = await page.evaluate(() => {
          const selectors = [
            "#password",
            'input[name="password"]',
            'input[type="password"]',
            'input[id="password"]',
            'input[placeholder*="pass"]',
          ]
          for (const selector of selectors) {
            if (document.querySelector(selector)) return selector
          }
          return null
        })

        console.log(`Sélecteurs trouvés - Username: ${usernameSelector}, Password: ${passwordSelector}`)

        if (!usernameSelector || !passwordSelector) {
          console.error("Impossible de trouver les champs de connexion")
          await page.screenshot({ path: "/tmp/login-fields-not-found.png" })
          throw new Error("Impossible de trouver les champs de connexion sur la page")
        }

        // Remplir les champs de connexion
        await page.type(usernameSelector, username)
        await page.type(passwordSelector, password)

        // Trouver le bouton de connexion
        const loginButtonSelector = await page.evaluate(() => {
          const selectors = [
            'input[type="submit"]',
            'button[type="submit"]',
            "button.submit",
            "button.login",
            "button.sign-in",
            "button#kc-login",
            "input.submit",
          ]
          for (const selector of selectors) {
            if (document.querySelector(selector)) return selector
          }
          return null
        })

        if (!loginButtonSelector) {
          console.error("Impossible de trouver le bouton de connexion")
          await page.screenshot({ path: "/tmp/login-button-not-found.png" })
          throw new Error("Impossible de trouver le bouton de connexion sur la page")
        }

        console.log(`Bouton de connexion trouvé: ${loginButtonSelector}`)

        // Prendre une capture d'écran avant de cliquer sur le bouton de connexion
        await page.screenshot({ path: "/tmp/before-login-click.png" })

        // Cliquer sur le bouton de connexion
        await Promise.all([
          page.click(loginButtonSelector),
          page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch((e) => {
            console.log(`Navigation non détectée après connexion: ${e.message}`)
          }),
        ])

        // Attendre un peu pour s'assurer que la page est chargée
        await delay(5000)
      } else {
        console.log("Déjà connecté ou redirection automatique non effectuée")
      }

      // Prendre une capture d'écran après la connexion
      await page.screenshot({ path: "/tmp/after-login.png" })

      // Capturer l'URL actuelle
      const afterLoginUrl = page.url()
      console.log(`URL après connexion: ${afterLoginUrl}`)

      // Vérifier si nous sommes sur la page d'accueil
      const isOnHomePage = afterLoginUrl.includes("/home/") || afterLoginUrl.includes("isolutions.iso.org")
      console.log(`Sur la page d'accueil: ${isOnHomePage}`)

      if (!isOnHomePage) {
        console.error("La connexion a échoué ou la redirection n'a pas fonctionné")
        throw new Error("Échec de la connexion. Vérifiez vos identifiants.")
      }

      console.log("Connexion réussie!")

      // Naviguer directement vers la page de recherche des votes
      console.log("Navigation vers la page de recherche des votes...")
      await page.goto(
        "https://isolutions.iso.org/ballots/part/viewMyBallots.do?method=doSearch&org.apache.struts.taglib.html.CANCEL=true&startIndex=0",
        {
          waitUntil: "networkidle2",
          timeout: 30000,
        },
      )

      // Attendre un peu pour s'assurer que la page est chargée
      await delay(5000)

      // Prendre une capture d'écran de la page de recherche
      await page.screenshot({ path: "/tmp/search-page.png" })
      await capturePageHtml(page, "/tmp/search-page.html")

      // Vérifier si nous sommes sur la page de recherche
      const pageTitle = await page.title()
      console.log(`Titre de la page: ${pageTitle}`)

      // Capturer l'état de la page avant la sélection de la commission
      await page.screenshot({ path: "/tmp/before-committee-selection.png" })

      // Sélectionner la commission
      console.log(`Sélection de la commission: ${commissionId}`)

      // Attendre que le sélecteur de commission soit disponible
      const committeeSelector = await page.evaluate(() => {
        const selectors = [
          'select[name="committee"]',
          'select[name="committeeId"]',
          'select[id*="committee"]',
          'select[id*="Committee"]',
        ]
        for (const selector of selectors) {
          if (document.querySelector(selector)) return selector
        }
        return null
      })

      if (!committeeSelector) {
        console.error("Impossible de trouver le sélecteur de commission")
        await page.screenshot({ path: "/tmp/committee-selector-not-found.png" })
        await capturePageHtml(page, "/tmp/committee-selector-not-found.html")
        throw new Error("Sélecteur de commission non trouvé")
      }

      console.log(`Sélecteur de commission trouvé: ${committeeSelector}`)

      // Sélectionner la commission
      await page.select(committeeSelector, commissionId)

      // Définir la date
      if (startDate) {
        console.log(`Définition de la date: ${startDate}`)
        const dateSelector = await page.evaluate(() => {
          const selectors = [
            'input[name="closingDateFrom"]',
            'input[id*="closingDateFrom"]',
            'input[id*="ClosingDateFrom"]',
            'input[name*="closing"]',
            'input[name*="Closing"]',
          ]
          for (const selector of selectors) {
            if (document.querySelector(selector)) return selector
          }
          return null
        })

        if (!dateSelector) {
          console.error("Impossible de trouver le sélecteur de date")
          await page.screenshot({ path: "/tmp/date-selector-not-found.png" })
          await capturePageHtml(page, "/tmp/date-selector-not-found.html")
          throw new Error("Sélecteur de date non trouvé")
        }

        console.log(`Sélecteur de date trouvé: ${dateSelector}`)

        await page.evaluate(
          (selector, date) => {
            const input = document.querySelector(selector)
            if (input) input.value = date
          },
          dateSelector,
          startDate,
        )
      }

      // Lancer la recherche
      console.log("Lancement de la recherche...")

      // Trouver le bouton de recherche
      const searchButtonSelector = await page.evaluate(() => {
        const selectors = [
          'button[type="submit"]',
          'input[type="submit"]',
          "button.submit",
          "button.search",
          "input.submit",
          "input.search",
          'button:contains("Search")',
          'button:contains("Rechercher")',
        ]
        for (const selector of selectors) {
          try {
            const element = document.querySelector(selector)
            if (element) return selector
          } catch (e) {
            // Ignorer les erreurs de sélecteur invalide
            console.log(`Erreur avec le sélecteur ${selector}: ${e.message}`)
          }
        }

        // Rechercher par texte si les sélecteurs ne fonctionnent pas
        const buttons = Array.from(document.querySelectorAll("button, input[type='submit']"))
        for (const button of buttons) {
          if (
            button.innerText?.toLowerCase().includes("search") ||
            button.innerText?.toLowerCase().includes("rechercher") ||
            button.value?.toLowerCase().includes("search") ||
            button.value?.toLowerCase().includes("rechercher")
          ) {
            // Retourner un sélecteur unique pour ce bouton
            if (button.id) return `#${button.id}`
            if (button.name) return `[name="${button.name}"]`
            if (button.className) return `.${button.className.split(" ").join(".")}`
            return button.tagName.toLowerCase()
          }
        }
        return null
      })

      if (!searchButtonSelector) {
        console.error("Impossible de trouver le bouton de recherche")
        await page.screenshot({ path: "/tmp/search-button-not-found.png" })
        await capturePageHtml(page, "/tmp/search-button-not-found.html")
        throw new Error("Bouton de recherche non trouvé")
      }

      console.log(`Bouton de recherche trouvé: ${searchButtonSelector}`)

      // Cliquer sur le bouton de recherche
      await Promise.all([
        page.click(searchButtonSelector),
        page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch((e) => {
          console.log(`Navigation non détectée après recherche: ${e.message}`)
        }),
      ])

      // Attendre un peu pour s'assurer que les résultats sont chargés
      await delay(5000)

      // Prendre une capture d'écran des résultats
      await page.screenshot({ path: "/tmp/search-results.png" })
      await capturePageHtml(page, "/tmp/search-results.html")

      // Trouver le tableau des résultats
      const tableSelector = await page.evaluate(() => {
        const selectors = ["table.ballotList", "table.ballot-list", "table.results", "table.search-results", "table"]
        for (const selector of selectors) {
          if (document.querySelector(selector)) return selector
        }
        return null
      })

      if (!tableSelector) {
        console.log("Tableau des résultats non trouvé, continuons quand même")
      } else {
        console.log(`Tableau des résultats trouvé: ${tableSelector}`)
      }

      // Extraire les résultats
      console.log("Extraction des résultats...")
      const votes = await page.evaluate((tableSelector) => {
        const results = []

        // Si le tableau est trouvé, extraire les données du tableau
        if (tableSelector && document.querySelector(tableSelector)) {
          const table = document.querySelector(tableSelector)
          const rows = table.querySelectorAll("tr:not(:first-child)")

          rows.forEach((row, index) => {
            const cells = row.querySelectorAll("td")
            if (cells.length < 8) return

            const refElement = cells[2]?.querySelector("a")

            results.push({
              id: `vote-${index + 1}`,
              ref: refElement ? refElement.textContent.trim() : cells[2]?.textContent.trim() || "",
              title: refElement
                ? refElement.getAttribute("title") || refElement.textContent.trim()
                : cells[2]?.textContent.trim() || "",
              committee: cells[1]?.textContent.trim() || "",
              votes: cells[3]?.textContent.trim() || "",
              result: cells[4]?.textContent.trim() || "",
              status: cells[5]?.textContent.trim() || "",
              openingDate: cells[6]?.textContent.trim() || "",
              closingDate: cells[7]?.textContent.trim() || "",
              role: cells[8] ? cells[8].textContent.trim() : "",
              sourceType: cells[9] ? cells[9].textContent.trim() : "",
              source: cells[10] ? cells[10].textContent.trim() : "",
            })
          })
        } else {
          // Si le tableau n'est pas trouvé, essayer d'extraire les données d'une autre manière
          // Par exemple, rechercher des éléments qui pourraient contenir des informations sur les votes
          const ballotElements = document.querySelectorAll(
            ".ballot, .vote, .result, [id*='ballot'], [id*='vote'], [class*='ballot'], [class*='vote']",
          )

          ballotElements.forEach((element, index) => {
            // Extraire les informations disponibles
            const ref = element.querySelector("[data-ref], [class*='ref'], [id*='ref']")?.textContent.trim() || ""
            const title =
              element.querySelector("[data-title], [class*='title'], [id*='title']")?.textContent.trim() || ""
            const committee =
              element.querySelector("[data-committee], [class*='committee'], [id*='committee']")?.textContent.trim() ||
              ""
            const votes =
              element.querySelector("[data-votes], [class*='votes'], [id*='votes']")?.textContent.trim() || ""
            const result =
              element.querySelector("[data-result], [class*='result'], [id*='result']")?.textContent.trim() || ""
            const status =
              element.querySelector("[data-status], [class*='status'], [id*='status']")?.textContent.trim() || ""
            const openingDate =
              element.querySelector("[data-opening], [class*='opening'], [id*='opening']")?.textContent.trim() || ""
            const closingDate =
              element.querySelector("[data-closing], [class*='closing'], [id*='closing']")?.textContent.trim() || ""

            results.push({
              id: `vote-${index + 1}`,
              ref,
              title,
              committee,
              votes,
              result,
              status,
              openingDate,
              closingDate,
              role: "",
              sourceType: "",
              source: "",
            })
          })
        }

        return results
      }, tableSelector)

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
              // Rechercher tous les liens qui pourraient mener aux détails du vote
              const links = Array.from(document.querySelectorAll("a"))

              // D'abord essayer de trouver un lien exact
              const exactLink = links.find((link) => link.textContent.trim() === voteRef)
              if (exactLink) return exactLink.href

              // Sinon, essayer de trouver un lien qui contient la référence
              const containingLink = links.find((link) => link.textContent.trim().includes(voteRef))
              if (containingLink) return containingLink.href

              return null
            }, vote.ref)

            if (detailsLink) {
              // Naviguer vers la page de détails
              await page.goto(detailsLink, { waitUntil: "networkidle2", timeout: 30000 }).catch(async (error) => {
                console.error(`Erreur lors de la navigation vers les détails du vote ${vote.ref}:`, error)
                // Continuer avec le vote suivant
                return
              })

              // Attendre que la page de détails soit chargée
              await delay(3000)

              // Prendre une capture d'écran de la page de détails
              await page.screenshot({ path: `/tmp/vote-details-${i}.png` })
              await capturePageHtml(page, `/tmp/vote-details-${i}.html`)

              // Trouver le tableau des détails
              const detailsTableSelector = await page.evaluate(() => {
                const selectors = ["table.voteList", "table.vote-list", "table.details", "table.vote-details", "table"]
                for (const selector of selectors) {
                  if (document.querySelector(selector)) return selector
                }
                return null
              })

              if (detailsTableSelector) {
                console.log(`Tableau des détails trouvé: ${detailsTableSelector}`)

                // Extraire les détails
                vote.voteDetails = await page.evaluate((tableSelector) => {
                  const details = []
                  const table = document.querySelector(tableSelector)
                  const rows = table.querySelectorAll("tr:not(:first-child)")

                  rows.forEach((row) => {
                    const cells = row.querySelectorAll("td")
                    if (cells.length < 4) return

                    details.push({
                      participant: cells[0]?.textContent.trim() || "",
                      vote: cells[1]?.textContent.trim() || "",
                      castBy: cells[2]?.textContent.trim() || "",
                      date: cells[3]?.textContent.trim() || "",
                    })
                  })

                  return details
                }, detailsTableSelector)

                console.log(`${vote.voteDetails.length} détails extraits pour le vote ${vote.ref}`)
              } else {
                console.log(`Tableau des détails non trouvé pour le vote ${vote.ref}`)
                vote.voteDetails = []
              }

              // Revenir à la page des résultats
              await page
                .goto(
                  "https://isolutions.iso.org/ballots/part/viewMyBallots.do?method=doSearch&org.apache.struts.taglib.html.CANCEL=true&startIndex=0",
                  {
                    waitUntil: "networkidle2",
                    timeout: 30000,
                  },
                )
                .catch(async (error) => {
                  console.error(`Erreur lors du retour à la page des résultats après le vote ${vote.ref}:`, error)
                })

              // Attendre un peu pour s'assurer que la page est chargée
              await delay(3000)
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
