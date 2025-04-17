const express = require("express")
const cors = require("cors")
const puppeteer = require("puppeteer")
const app = express()
const port = process.env.PORT || 3000
const path = require("path")
const fs = require("fs")

// Activer CORS pour permettre les requêtes depuis votre application Vercel
app.use(cors())
app.use(express.json())

// Créer un dossier public pour servir les captures d'écran
const publicDir = path.join(__dirname, "public")
const screenshotsDir = path.join(publicDir, "screenshots")

// Créer les dossiers s'ils n'existent pas
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir)
}
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir)
}

// Servir les fichiers statiques du dossier public
app.use("/public", express.static(publicDir))

// Route de test pour vérifier que l'API fonctionne
app.get("/", (req, res) => {
  res.json({ status: "API NBN Ballots opérationnelle" })
})

// Route pour maintenir le service actif (ping)
app.get("/ping", (req, res) => {
  res.json({ status: "pong", timestamp: new Date().toISOString() })
})

// Route pour accéder aux captures d'écran
app.get("/screenshots", (req, res) => {
  try {
    const files = fs.readdirSync(screenshotsDir)
    const screenshots = files
      .map((file) => {
        return {
          name: file,
          url: `${req.protocol}://${req.get("host")}/public/screenshots/${file}`,
          timestamp: fs.statSync(path.join(screenshotsDir, file)).mtime,
        }
      })
      .sort((a, b) => b.timestamp - a.timestamp) // Trier par date de modification (plus récent en premier)

    res.json({ screenshots })
  } catch (error) {
    res.status(500).json({ error: "Erreur lors de la récupération des captures d'écran", details: error.message })
  }
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

// Fonction pour générer un nom de fichier unique pour les captures d'écran
function generateScreenshotFilename(prefix) {
  const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\./g, "-")
  return `${prefix}-${timestamp}.png`
}

// Fonction pour capturer le HTML de la page pour le débogage
async function capturePageHtml(page, htmlPath) {
  try {
    const html = await page.content().catch((e) => {
      console.log(`Erreur lors de la capture du HTML: ${e.message}`)
      return "Erreur lors de la capture du HTML"
    })

    // Enregistrer le HTML
    fs.writeFileSync(htmlPath, html)
    console.log(`HTML capturé et enregistré dans ${htmlPath}`)

    // Générer un nom de fichier pour la capture d'écran
    const filename = generateScreenshotFilename(path.basename(htmlPath, ".html"))
    const screenshotPath = path.join(screenshotsDir, filename)

    // Prendre une capture d'écran
    await page.screenshot({ path: screenshotPath, fullPage: true })
    console.log(`Capture d'écran enregistrée dans ${screenshotPath}`)

    // Générer l'URL de la capture d'écran
    const baseUrl = process.env.RENDER_BASE_URL || `http://localhost:${port}`
    const screenshotUrl = `${baseUrl}/public/screenshots/${filename}`

    // Stocker l'URL dans un objet global pour l'inclure dans la réponse
    if (!global.screenshotUrls) {
      global.screenshotUrls = {}
    }
    global.screenshotUrls[path.basename(htmlPath)] = screenshotUrl

    console.log(`URL de la capture d'écran: ${screenshotUrl}`)

    return {
      html,
      screenshotUrl,
    }
  } catch (error) {
    console.error(`Erreur lors de la capture du HTML pour ${htmlPath}:`, error)
    return {
      html: "Erreur lors de la capture du HTML",
      error: error.message,
    }
  }
}

// Fonction pour attendre un délai (compatible avec toutes les versions de Puppeteer)
async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Fonction pour attendre que la navigation soit complète
async function waitForNavigationSafely(page, options = {}) {
  try {
    await page.waitForNavigation({
      waitUntil: "networkidle2",
      timeout: options.timeout || 30000,
      ...options,
    })
    console.log("Navigation terminée avec succès")
  } catch (error) {
    console.log(`Erreur lors de l'attente de la navigation: ${error.message}`)
  }
}

// Fonction pour améliorer la sélection d'éléments avec des sélecteurs complexes
async function enhancedQuerySelector(page, selector, textContent) {
  return page.evaluate(
    (selector, textContent) => {
      // Si un sélecteur standard est fourni, l'utiliser directement
      if (!textContent) {
        return document.querySelector(selector) !== null
      }

      // Sinon, rechercher par contenu de texte
      const elements = Array.from(document.querySelectorAll(selector))
      return elements.some((el) => el.textContent.includes(textContent))
    },
    selector,
    textContent,
  )
}

// Route principale pour l'extraction des votes
app.post("/api/extract-votes", async (req, res) => {
  console.log("Requête d'extraction reçue")
  let browser = null
  // Initialiser un tableau pour stocker les URLs des captures d'écran
  const screenshotUrls = []
  // Créer un ID de session unique pour regrouper les captures d'écran
  const sessionId = Date.now().toString()

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
      page.setDefaultNavigationTimeout(60000) // Augmenter le timeout à 60 secondes
      page.setDefaultTimeout(60000)

      // Activer la journalisation de la console du navigateur
      page.on("console", (msg) => console.log("Console du navigateur:", msg.text()))

      // Intercepter les erreurs de page
      page.on("pageerror", (error) => {
        console.error("Erreur de page:", error.message)
      })

      // Intercepter les requêtes réseau pour le débogage
      page.on("request", (request) => {
        if (request.resourceType() === "document") {
          console.log(`Navigation vers: ${request.url()}`)
        }
      })

      page.on("response", (response) => {
        if (response.request().resourceType() === "document") {
          console.log(`Réponse de: ${response.url()} - Statut: ${response.status()}`)
        }
      })

      // Naviguer directement vers la page principale d'ISO
      console.log("Navigation vers isolutions.iso.org...")
      await page.goto("https://isolutions.iso.org", {
        waitUntil: "networkidle2",
        timeout: 60000,
      })

      // Attendre un peu pour s'assurer que la page est chargée
      await delay(5000)

      // Prendre une capture d'écran pour le débogage
      const initialScreenshotPath = path.join(screenshotsDir, `${sessionId}-initial-page.png`)
      await page.screenshot({ path: initialScreenshotPath, fullPage: true })

      // Générer l'URL de la capture d'écran
      const baseUrl = process.env.RENDER_BASE_URL || `http://localhost:${port}`
      const initialScreenshotUrl = `${baseUrl}/public/screenshots/${path.basename(initialScreenshotPath)}`
      screenshotUrls.push({ name: "Page initiale", url: initialScreenshotUrl })
      console.log(`Capture d'écran initiale: ${initialScreenshotUrl}`)

      // Capturer l'URL actuelle pour voir si nous sommes redirigés vers la page de connexion
      const currentUrl = page.url()
      console.log(`URL actuelle: ${currentUrl}`)

      // Vérifier si nous sommes sur la page de connexion (URL contient idp.iso.org)
      const isOnLoginPage = currentUrl.includes("idp.iso.org")
      console.log(`Sur la page de connexion: ${isOnLoginPage}`)

      if (isOnLoginPage) {
        console.log("Page de connexion détectée, tentative de connexion...")

        // Prendre une capture d'écran de la page de connexion
        const loginScreenshotPath = path.join(screenshotsDir, `${sessionId}-login-page.png`)
        await page.screenshot({ path: loginScreenshotPath, fullPage: true })
        const loginScreenshotUrl = `${baseUrl}/public/screenshots/${path.basename(loginScreenshotPath)}`
        screenshotUrls.push({ name: "Page de connexion", url: loginScreenshotUrl })
        console.log(`Capture d'écran de la page de connexion: ${loginScreenshotUrl}`)

        // Capturer le HTML de la page de connexion
        const loginHtmlPath = path.join("/tmp", `${sessionId}-login-page.html`)
        const loginHtmlResult = await capturePageHtml(page, loginHtmlPath)
        if (loginHtmlResult.screenshotUrl) {
          screenshotUrls.push({ name: "HTML de la page de connexion", url: loginHtmlResult.screenshotUrl })
        }

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
          const loginFieldsNotFoundPath = path.join(screenshotsDir, `${sessionId}-login-fields-not-found.png`)
          await page.screenshot({ path: loginFieldsNotFoundPath, fullPage: true })
          const loginFieldsNotFoundUrl = `${baseUrl}/public/screenshots/${path.basename(loginFieldsNotFoundPath)}`
          screenshotUrls.push({ name: "Champs de connexion non trouvés", url: loginFieldsNotFoundUrl })
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
          const loginButtonNotFoundPath = path.join(screenshotsDir, `${sessionId}-login-button-not-found.png`)
          await page.screenshot({ path: loginButtonNotFoundPath, fullPage: true })
          const loginButtonNotFoundUrl = `${baseUrl}/public/screenshots/${path.basename(loginButtonNotFoundPath)}`
          screenshotUrls.push({ name: "Bouton de connexion non trouvé", url: loginButtonNotFoundUrl })
          throw new Error("Impossible de trouver le bouton de connexion sur la page")
        }

        console.log(`Bouton de connexion trouvé: ${loginButtonSelector}`)

        // Prendre une capture d'écran avant de cliquer sur le bouton de connexion
        const beforeLoginClickPath = path.join(screenshotsDir, `${sessionId}-before-login-click.png`)
        await page.screenshot({ path: beforeLoginClickPath, fullPage: true })
        const beforeLoginClickUrl = `${baseUrl}/public/screenshots/${path.basename(beforeLoginClickPath)}`
        screenshotUrls.push({ name: "Avant clic sur connexion", url: beforeLoginClickUrl })

        // Cliquer sur le bouton de connexion et attendre la navigation
        await Promise.all([page.click(loginButtonSelector), waitForNavigationSafely(page, { timeout: 60000 })])

        // Attendre un peu pour s'assurer que la page est chargée
        await delay(5000) // Augmenter le délai à 10 secondes
      } else {
        console.log("Déjà connecté ou redirection automatique non effectuée")
      }

      // Prendre une capture d'écran après la connexion
      const afterLoginPath = path.join(screenshotsDir, `${sessionId}-after-login.png`)
      await page.screenshot({ path: afterLoginPath, fullPage: true })
      const afterLoginUrl = `${baseUrl}/public/screenshots/${path.basename(afterLoginPath)}`
      screenshotUrls.push({ name: "Après connexion", url: afterLoginUrl })

      // Capturer l'URL actuelle
      const afterLoginPageUrl = page.url()
      console.log(`URL après connexion: ${afterLoginPageUrl}`)

      // Vérifier si nous sommes sur la page d'accueil
      const isOnHomePage = afterLoginPageUrl.includes("/home/") || afterLoginPageUrl.includes("isolutions.iso.org")
      console.log(`Sur la page d'accueil: ${isOnHomePage}`)

      if (!isOnHomePage) {
        console.error("La connexion a échoué ou la redirection n'a pas fonctionné")
        throw new Error("Échec de la connexion. Vérifiez vos identifiants.")
      }

      console.log("Connexion réussie!")

      // Naviguer directement vers la page de recherche des votes
      console.log("Navigation vers la page de recherche des votes...")

      // Utiliser une approche plus robuste pour la navigation
      try {
        // Naviguer vers la page de ballots
        await page.goto("https://isolutions.iso.org/ballots/", {
          waitUntil: "networkidle2",
          timeout: 60000,
        })

        // Attendre que la page soit chargée
        await delay(10000)

        // Prendre une capture d'écran de la page de ballots
        const ballotsPagePath = path.join(screenshotsDir, `${sessionId}-ballots-page.png`)
        await page.screenshot({ path: ballotsPagePath, fullPage: true })
        const ballotsPageUrl = `${baseUrl}/public/screenshots/${path.basename(ballotsPagePath)}`
        screenshotUrls.push({ name: "Page des ballots", url: ballotsPageUrl })

        // Naviguer vers la page de recherche
        await page.goto(
          "https://isolutions.iso.org/ballots/part/viewMyBallots.do?method=doSearch&org.apache.struts.taglib.html.CANCEL=true&startIndex=0",
          {
            waitUntil: "networkidle2",
            timeout: 60000,
          },
        )

        // Attendre que la page soit complètement chargée
        await delay(8000) // Augmenter le délai à 15 secondes
      } catch (error) {
        console.error("Erreur lors de la navigation vers la page de recherche:", error)
        const navigationErrorPath = path.join(screenshotsDir, `${sessionId}-navigation-error.png`)
        await page.screenshot({ path: navigationErrorPath, fullPage: true })
        const navigationErrorUrl = `${baseUrl}/public/screenshots/${path.basename(navigationErrorPath)}`
        screenshotUrls.push({ name: "Erreur de navigation", url: navigationErrorUrl })
        throw new Error(`Erreur lors de la navigation vers la page de recherche: ${error.message}`)
      }

      // Prendre une capture d'écran de la page de recherche
      const searchPagePath = path.join(screenshotsDir, `${sessionId}-search-page.png`)
      await page.screenshot({ path: searchPagePath, fullPage: true })
      const searchPageUrl = `${baseUrl}/public/screenshots/${path.basename(searchPagePath)}`
      screenshotUrls.push({ name: "Page de recherche", url: searchPageUrl })

      // Capturer le HTML de la page de recherche
      const searchHtmlPath = path.join("/tmp", `${sessionId}-search-page.html`)
      const searchHtmlResult = await capturePageHtml(page, searchHtmlPath)
      if (searchHtmlResult.screenshotUrl) {
        screenshotUrls.push({ name: "HTML de la page de recherche", url: searchHtmlResult.screenshotUrl })
      }

      // Vérifier si nous sommes sur la page de recherche
      const pageTitle = await page.title().catch((e) => {
        console.log(`Erreur lors de la récupération du titre de la page: ${e.message}`)
        return "Titre inconnu"
      })
      console.log(`Titre de la page: ${pageTitle}`)

      // Capturer l'état de la page avant la sélection de la commission
      const beforeCommitteeSelectionPath = path.join(screenshotsDir, `${sessionId}-before-committee-selection.png`)
      await page.screenshot({ path: beforeCommitteeSelectionPath, fullPage: true })
      const beforeCommitteeSelectionUrl = `${baseUrl}/public/screenshots/${path.basename(beforeCommitteeSelectionPath)}`
      screenshotUrls.push({ name: "Avant sélection de commission", url: beforeCommitteeSelectionUrl })

      // Vérifier si le sélecteur de commission existe
      const committeeSelectExists = await page
        .evaluate(() => {
          return !!document.querySelector('select[name="searchCommitteeId"]')
        })
        .catch((e) => {
          console.log(`Erreur lors de la vérification du sélecteur de commission: ${e.message}`)
          return false
        })

      console.log(`Sélecteur de commission existe: ${committeeSelectExists}`)

      if (committeeSelectExists) {
        // Sélectionner la commission
        console.log(`Sélection de la commission: ${commissionId}`)
        await page.select('select[name="searchCommitteeId"]', commissionId).catch((e) => {
          console.log(`Erreur lors de la sélection de la commission: ${e.message}`)
        })

        // Prendre une capture d'écran après la sélection de la commission
        const afterCommitteeSelectionPath = path.join(screenshotsDir, `${sessionId}-after-committee-selection.png`)
        await page.screenshot({ path: afterCommitteeSelectionPath, fullPage: true })
        const afterCommitteeSelectionUrl = `${baseUrl}/public/screenshots/${path.basename(afterCommitteeSelectionPath)}`
        screenshotUrls.push({ name: "Après sélection de commission", url: afterCommitteeSelectionUrl })

        // Définir la date si demandé
        if (startDate) {
          console.log(`Définition de la date: ${startDate}`)
          await page
            .evaluate((date) => {
              const dateInput = document.querySelector('input[name="searchBeginDateString"]')
              if (dateInput) dateInput.value = date
            }, startDate)
            .catch((e) => {
              console.log(`Erreur lors de la définition de la date: ${e.message}`)
            })

          // Prendre une capture d'écran après la définition de la date
          const afterDateSettingPath = path.join(screenshotsDir, `${sessionId}-after-date-setting.png`)
          await page.screenshot({ path: afterDateSettingPath, fullPage: true })
          const afterDateSettingUrl = `${baseUrl}/public/screenshots/${path.basename(afterDateSettingPath)}`
          screenshotUrls.push({ name: "Après définition de la date", url: afterDateSettingUrl })
        }

        // Cliquer sur le bouton de recherche
        console.log("Clic sur le bouton de recherche")
        await page.click('input[id="searchBt"]').catch((e) => {
          console.log(`Erreur lors du clic sur le bouton de recherche: ${e.message}`)
        })

        // Attendre que la recherche soit terminée
        await delay(15000) // Attendre 15 secondes pour que les résultats se chargent

        // Prendre une capture d'écran des résultats
        const searchResultsPath = path.join(screenshotsDir, `${sessionId}-search-results.png`)
        await page.screenshot({ path: searchResultsPath, fullPage: true })
        const searchResultsUrl = `${baseUrl}/public/screenshots/${path.basename(searchResultsPath)}`
        screenshotUrls.push({ name: "Résultats de recherche", url: searchResultsUrl })

        // Capturer le HTML des résultats
        const resultsHtmlPath = path.join("/tmp", `${sessionId}-search-results.html`)
        const resultsHtmlResult = await capturePageHtml(page, resultsHtmlPath)
        if (resultsHtmlResult.screenshotUrl) {
          screenshotUrls.push({ name: "HTML des résultats", url: resultsHtmlResult.screenshotUrl })
        }

        // Extraire les résultats du tableau
        console.log("Extraction des résultats...")

        const votes = await page
          .evaluate(() => {
            // Trouver le tableau des résultats
            const table = document.querySelector("table.listTable")
            if (!table) return []

            // Récupérer les en-têtes
            const headers = Array.from(table.querySelectorAll("th")).map((th) => th.innerText.trim().toLowerCase())

            // Récupérer les lignes de données
            const rows = Array.from(table.querySelectorAll("tbody tr"))

            // Extraire les données de chaque ligne
            return rows
              .map((row, index) => {
                const cells = Array.from(row.querySelectorAll("td"))
                if (cells.length < 3) return null // Ignorer les lignes avec trop peu de cellules

                // Créer un objet pour stocker les données
                const rowData = {
                  id: `vote-${index + 1}`,
                  ref: "",
                  title: "",
                  committee: "",
                  votes: "",
                  result: "",
                  status: "",
                  openingDate: "",
                  closingDate: "",
                  role: "",
                  sourceType: "",
                  source: "",
                }

                // Associer les cellules aux en-têtes
                cells.forEach((cell, i) => {
                  const header = headers[i] || `column${i}`
                  const text = cell.innerText.trim()
                  const link = cell.querySelector("a")
                  const href = link ? link.href : null

                  // Déterminer le type de données
                  if (header.includes("ref") || header.includes("reference")) {
                    rowData.ref = text
                    rowData.title = link ? link.title || text : text
                    if (href) {
                      rowData.detailsUrl = href

                      // Extraire l'ID du vote à partir de l'URL ou du lien JavaScript
                      const idMatch = href.match(/id=(\d+)/) || href.match(/(\d+)/)
                      if (idMatch && idMatch[1]) {
                        rowData.voteId = idMatch[1]
                      }

                      // Déterminer le type de vote (npos, ncib, etc.) à partir de l'URL ou du lien JavaScript
                      const typeMatch = href.match(/'([^']+)','doView'/) || href.match(/\/([^/]+)\/ballotAction\.do/)
                      if (typeMatch && typeMatch[1]) {
                        rowData.voteType = typeMatch[1]
                      }
                    }
                  } else if (header.includes("committee")) {
                    rowData.committee = text
                  } else if (header.includes("vote")) {
                    rowData.votes = text
                  } else if (header.includes("result")) {
                    rowData.result = text
                  } else if (header.includes("status")) {
                    rowData.status = text
                  } else if (header.includes("opening")) {
                    rowData.openingDate = text
                  } else if (header.includes("closing")) {
                    rowData.closingDate = text
                  } else if (header.includes("role")) {
                    rowData.role = text
                  } else if (header.includes("source") && header.includes("type")) {
                    rowData.sourceType = text
                  } else if (header.includes("source") && !header.includes("type")) {
                    rowData.source = text
                  }
                })

                return rowData
              })
              .filter(Boolean) // Filtrer les lignes nulles
          })
          .catch((e) => {
            console.log(`Erreur lors de l'extraction des résultats: ${e.message}`)
            return []
          })

        console.log(`${votes.length} votes extraits`)

        // Extraire les détails des votes si demandé
        if (extractDetails && votes.length > 0) {
          console.log("Extraction des détails des votes...")

          const startTime = Date.now()
          const MAX_EXTRACTION_TIME = 45000 // 45 secondes maximum pour l'extraction

          for (let i = 0; i < votes.length; i++) {
            const vote = votes[i]

            // Vérifier si on approche du timeout
            const elapsedTime = Date.now() - startTime
            if (elapsedTime > MAX_EXTRACTION_TIME) {
              console.log(`Temps d'extraction maximum atteint (${elapsedTime}ms). Arrêt de l'extraction des détails.`)
              break // Sortir de la boucle pour éviter un timeout
            }

            // Vérifier si le vote a des détails à extraire et une URL de détails
            if (vote.votes && vote.votes.includes("vote")) {
              console.log(`Extraction des détails pour le vote ${i + 1}/${votes.length}: ${vote.ref}`)

              try {
                // Essayer d'abord d'utiliser l'ID et le type du vote si disponibles
                if (vote.voteId && vote.voteType) {
                  const detailsUrl = `https://isolutions.iso.org/ballots/part/${vote.voteType}/ballotAction.do?method=doView&id=${vote.voteId}`
                  console.log(`Navigation vers: ${detailsUrl}`)

                  // Naviguer vers la page de détails
                  await page.goto(detailsUrl, { waitUntil: "networkidle2", timeout: 30000 })
                } else if (vote.detailsUrl) {
                  // Sinon, utiliser l'URL de détails originale
                  console.log(`Navigation vers les détails du vote ${vote.ref}`)

                  // Naviguer vers la page de détails
                  await page
                    .goto(vote.detailsUrl, { waitUntil: "networkidle2", timeout: 30000 })
                    .catch(async (error) => {
                      console.error(`Erreur lors de la navigation vers les détails du vote ${vote.ref}:`, error)

                      // Si l'URL est un javascript:, essayer d'extraire l'ID et le type
                      if (vote.detailsUrl.startsWith("javascript:")) {
                        const jsMatch = vote.detailsUrl.match(/'([^']+)','doView', (\d+)/)
                        if (jsMatch && jsMatch[1] && jsMatch[2]) {
                          const voteType = jsMatch[1]
                          const voteId = jsMatch[2]
                          const directUrl = `https://isolutions.iso.org/ballots/part/${voteType}/ballotAction.do?method=doView&id=${voteId}`
                          console.log(`Tentative avec URL directe: ${directUrl}`)
                          await page.goto(directUrl, { waitUntil: "networkidle2", timeout: 30000 })
                        } else {
                          throw new Error(`Impossible d'extraire l'ID et le type du vote depuis l'URL JavaScript`)
                        }
                      } else {
                        throw error
                      }
                    })
                } else {
                  console.log(`Pas d'URL de détails disponible pour le vote ${vote.ref}, passage au suivant`)
                  continue
                }

                // Attendre que la page de détails soit chargée
                await delay(5000)

                // Prendre une capture d'écran de la page de détails
                const voteDetailsPath = path.join(screenshotsDir, `${sessionId}-vote-details-${i}.png`)
                await page.screenshot({ path: voteDetailsPath, fullPage: true })
                const voteDetailsUrl = `${baseUrl}/public/screenshots/${path.basename(voteDetailsPath)}`
                screenshotUrls.push({ name: `Détails du vote ${vote.ref}`, url: voteDetailsUrl })

                // Capturer le HTML des détails
                const voteDetailsHtmlPath = path.join("/tmp", `${sessionId}-vote-details-${i}.html`)
                const voteDetailsHtmlResult = await capturePageHtml(page, voteDetailsHtmlPath)
                if (voteDetailsHtmlResult.screenshotUrl) {
                  screenshotUrls.push({
                    name: `HTML des détails du vote ${vote.ref}`,
                    url: voteDetailsHtmlResult.screenshotUrl,
                  })
                }

                // Extraire les détails du vote
                vote.voteDetails = await page.evaluate(() => {
                  // Trouver le tableau des détails
                  const tables = Array.from(document.querySelectorAll("table"))
                  let detailsTable = null

                  // Chercher le tableau qui contient les détails des votes
                  for (const table of tables) {
                    const headers = Array.from(table.querySelectorAll("th")).map((th) =>
                      th.innerText.trim().toLowerCase(),
                    )
                    if (
                      headers.some(
                        (h) =>
                          h.includes("participant") || h.includes("vote") || h.includes("cast") || h.includes("date"),
                      )
                    ) {
                      detailsTable = table
                      break
                    }
                  }

                  // Extraire les informations supplémentaires des tableaux spécifiques
                  const additionalInfo = {
                    openingDate: "",
                    committeeClosingDate: "",
                    committee: "",
                    cenIsoClosingDate: "",
                    title: "",
                  }

                  // Extraire les informations du tableau #cmBalInfoArea
                  const infoTable = document.getElementById("cmBalInfoArea")
                  if (infoTable) {
                    // Méthode alternative pour trouver la date d'ouverture
                    const allLabels = Array.from(infoTable.querySelectorAll("td.label"))
                    const openingLabel = allLabels.find((label) => label.textContent.includes("Opening date:"))
                    if (openingLabel && openingLabel.nextElementSibling) {
                      const dateSpan = openingLabel.nextElementSibling.querySelector("span.datetz")
                      if (dateSpan) {
                        additionalInfo.openingDate = dateSpan.textContent.trim()
                      } else {
                        additionalInfo.openingDate = openingLabel.nextElementSibling.textContent.trim()
                      }
                    }

                    // Méthode alternative pour trouver la date de clôture
                    const closingLabel = allLabels.find((label) =>
                      label.textContent.includes("Committee closing date:"),
                    )
                    if (closingLabel && closingLabel.nextElementSibling) {
                      const dateSpan = closingLabel.nextElementSibling.querySelector("span.datetz")
                      if (dateSpan) {
                        additionalInfo.committeeClosingDate = dateSpan.textContent.trim()
                      } else {
                        additionalInfo.committeeClosingDate = closingLabel.nextElementSibling.textContent.trim()
                      }
                    }
                  }

                  // Extraire les informations du tableau #cmBalSourceInfoArea
                  const sourceTable = document.getElementById("cmBalSourceInfoArea")
                  if (sourceTable) {
                    // Méthode alternative pour trouver le comité
                    const allLabels = Array.from(sourceTable.querySelectorAll("td.label"))
                    const committeeLabel = allLabels.find((label) => label.textContent.includes("Committee:"))
                    if (committeeLabel && committeeLabel.nextElementSibling) {
                      additionalInfo.committee = committeeLabel.nextElementSibling.textContent.trim()
                    }

                    // Méthode alternative pour trouver la date de clôture CEN/ISO
                    const cenLabel = allLabels.find((label) => label.textContent.includes("CEN closing date:"))
                    const isoLabel = allLabels.find((label) => label.textContent.includes("ISO closing date:"))

                    if (cenLabel && cenLabel.nextElementSibling) {
                      additionalInfo.cenIsoClosingDate = cenLabel.nextElementSibling.textContent.trim()
                    } else if (isoLabel && isoLabel.nextElementSibling) {
                      additionalInfo.cenIsoClosingDate = isoLabel.nextElementSibling.textContent.trim()
                    }

                    // Méthode alternative pour trouver le titre
                    const titleLabels = Array.from(sourceTable.querySelectorAll("td.arealabel"))
                    const titleLabel = titleLabels.find((label) => label.textContent.includes("Title:"))
                    if (titleLabel && titleLabel.nextElementSibling) {
                      additionalInfo.title = titleLabel.nextElementSibling.textContent.trim()
                    }
                  }

                  if (!detailsTable) return { votes: [], additionalInfo }

                  // Récupérer les en-têtes
                  const headers = Array.from(detailsTable.querySelectorAll("th")).map((th) =>
                    th.innerText.trim().toLowerCase(),
                  )

                  // Récupérer les lignes de données
                  const rows = Array.from(detailsTable.querySelectorAll("tbody tr, tr:not(:first-child)"))

                  // Extraire les données de chaque ligne
                  const votes = rows
                    .map((row) => {
                      const cells = Array.from(row.querySelectorAll("td"))
                      if (cells.length < 3) return null // Ignorer les lignes avec trop peu de cellules

                      // Créer un objet pour stocker les données
                      const rowData = {
                        participant: "",
                        vote: "",
                        castBy: "",
                        date: "",
                      }

                      // Associer les cellules aux en-têtes
                      cells.forEach((cell, i) => {
                        const header = headers[i] || `column${i}`
                        const text = cell.innerText.trim()

                        // Déterminer le type de données
                        if (header.includes("participant") || header.includes("country")) {
                          rowData.participant = text
                        } else if (header.includes("vote")) {
                          rowData.vote = text
                        } else if (header.includes("cast") || header.includes("by") || header.includes("user")) {
                          rowData.castBy = text
                        } else if (header.includes("date")) {
                          rowData.date = text
                        } else if (i === 0) {
                          // Première colonne, probablement le participant
                          rowData.participant = text
                        } else if (i === 1) {
                          // Deuxième colonne, probablement le vote
                          rowData.vote = text
                        } else if (i === 2) {
                          // Troisième colonne, probablement qui a voté
                          rowData.castBy = text
                        } else if (i === 3) {
                          // Quatrième colonne, probablement la date
                          rowData.date = text
                        }
                      })

                      return rowData
                    })
                    .filter(Boolean) // Filtrer les lignes nulles

                  return { votes, additionalInfo }
                })

                // Ajuster la structure des données retournées pour inclure les informations supplémentaires
                if (vote.voteDetails && vote.voteDetails.votes) {
                  vote.additionalInfo = vote.voteDetails.additionalInfo
                  vote.voteDetails = vote.voteDetails.votes
                } else if (vote.voteDetails && !vote.voteDetails.votes) {
                  vote.additionalInfo = vote.voteDetails.additionalInfo || {}
                  vote.voteDetails = []
                }

                console.log(`${vote.voteDetails.length} détails extraits pour le vote ${vote.ref}`)
              } catch (error) {
                console.error(`Erreur lors de l'extraction des détails pour le vote ${vote.ref}:`, error)
                vote.voteDetails = []
              }

              // Revenir à la page des résultats
              try {
                await page.goto(
                  "https://isolutions.iso.org/ballots/part/viewMyBallots.do?method=doSearch&org.apache.struts.taglib.html.CANCEL=true&startIndex=0",
                  {
                    waitUntil: "networkidle2",
                    timeout: 30000,
                  },
                )
                await delay(5000)
              } catch (error) {
                console.error(`Erreur lors du retour à la page des résultats:`, error)
              }
            } else {
              vote.voteDetails = []
            }
          }
        }

        // Fermer le navigateur
        await browser.close()
        browser = null

        // Retourner les résultats avec les URLs des captures d'écran
        return res.json({
          votes,
          debug: {
            receivedCommissionId: commissionId,
            extractedCommissionCode: commissionCode,
            username: username,
            startDate: startDate,
            numVotesGenerated: votes.length,
            sessionId: sessionId,
            screenshotUrls: screenshotUrls,
          },
        })
      } else {
        // Si le sélecteur de commission n'est pas trouvé, essayer d'analyser la structure de la page
        console.log("Sélecteur de commission non trouvé, analyse de la structure de la page")

        // Prendre une capture d'écran pour le débogage
        const noCommitteeSelectorPath = path.join(screenshotsDir, `${sessionId}-no-committee-selector.png`)
        await page.screenshot({ path: noCommitteeSelectorPath, fullPage: true })
        const noCommitteeSelectorUrl = `${baseUrl}/public/screenshots/${path.basename(noCommitteeSelectorPath)}`
        screenshotUrls.push({ name: "Sélecteur de commission non trouvé", url: noCommitteeSelectorUrl })

        // Analyser la structure de la page pour trouver les formulaires et les champs
        const formInfo = await page
          .evaluate(() => {
            // Trouver tous les formulaires sur la page
            const forms = Array.from(document.querySelectorAll("form"))
            const formDetails = forms.map((form) => {
              // Récupérer les informations sur le formulaire
              const formId = form.id || "no-id"
              const formName = form.name || "no-name"
              const formAction = form.action || "no-action"
              const formMethod = form.method || "no-method"

              // Récupérer tous les champs du formulaire
              const inputs = Array.from(form.querySelectorAll("input, select, textarea"))
              const inputDetails = inputs.map((input) => {
                return {
                  type: input.tagName.toLowerCase(),
                  id: input.id || "no-id",
                  name: input.name || "no-name",
                  value: input.value || "no-value",
                  options:
                    input.tagName.toLowerCase() === "select" ? Array.from(input.options).map((opt) => opt.value) : [],
                }
              })

              return {
                id: formId,
                name: formName,
                action: formAction,
                method: formMethod,
                inputs: inputDetails,
              }
            })

            // Trouver tous les éléments qui pourraient être des sélecteurs de commission
            const possibleCommitteeSelectors = Array.from(document.querySelectorAll("select")).map((select) => {
              return {
                id: select.id || "no-id",
                name: select.name || "no-name",
                options: Array.from(select.options).map((opt) => ({
                  value: opt.value,
                  text: opt.text,
                })),
              }
            })

            return {
              forms: formDetails,
              possibleCommitteeSelectors,
              pageText: document.body.innerText.substring(0, 1000), // Premiers 1000 caractères du texte de la page
            }
          })
          .catch((e) => {
            console.log(`Erreur lors de l'analyse de la structure de la page: ${e.message}`)
            return { forms: [], possibleCommitteeSelectors: [], pageText: "" }
          })

        console.log("Informations sur les formulaires:", JSON.stringify(formInfo, null, 2))

        // Rechercher un sélecteur de commission dans les informations récupérées
        let committeeSelector = null
        const committeeValue = commissionId

        // Vérifier si nous avons trouvé des sélecteurs possibles
        if (formInfo.possibleCommitteeSelectors && formInfo.possibleCommitteeSelectors.length > 0) {
          // Parcourir les sélecteurs possibles
          for (const selector of formInfo.possibleCommitteeSelectors) {
            // Vérifier si le sélecteur a un nom qui pourrait correspondre à un sélecteur de commission
            if (
              selector.name.toLowerCase().includes("committee") ||
              selector.id.toLowerCase().includes("committee") ||
              selector.name.toLowerCase().includes("comite") ||
              selector.id.toLowerCase().includes("comite")
            ) {
              committeeSelector = selector.name ? `select[name="${selector.name}"]` : `select#${selector.id}`
              console.log(`Sélecteur de commission trouvé: ${committeeSelector}`)
              break
            }
          }

          // Si aucun sélecteur n'a été trouvé par nom, prendre le premier sélecteur disponible
          if (!committeeSelector && formInfo.possibleCommitteeSelectors.length > 0) {
            const firstSelector = formInfo.possibleCommitteeSelectors[0]
            committeeSelector = firstSelector.name
              ? `select[name="${firstSelector.name}"]`
              : `select#${firstSelector.id}`
            console.log(
              `Aucun sélecteur de commission spécifique trouvé, utilisation du premier sélecteur: ${committeeSelector}`,
            )
          }
        }

        // Si nous n'avons toujours pas de sélecteur, essayer de trouver un champ caché pour la commission
        if (!committeeSelector) {
          // Parcourir tous les formulaires et leurs champs
          for (const form of formInfo.forms) {
            for (const input of form.inputs) {
              // Vérifier si le champ a un nom qui pourrait correspondre à un champ de commission
              if (
                (input.name.toLowerCase().includes("committee") || input.id.toLowerCase().includes("committee")) &&
                input.type === "input"
              ) {
                committeeSelector = input.name ? `input[name="${input.name}"]` : `input#${input.id}`
                console.log(`Champ de commission trouvé: ${committeeSelector}`)
                break
              }
            }
            if (committeeSelector) break
          }
        }

        // Si nous avons un sélecteur, essayer de sélectionner la commission
        if (committeeSelector) {
          console.log(`Tentative de sélection de la commission avec le sélecteur: ${committeeSelector}`)

          // Vérifier si le sélecteur existe sur la page
          const selectorExists = await page.evaluate((selector) => {
            return !!document.querySelector(selector)
          }, committeeSelector)

          if (selectorExists) {
            // Si c'est un select, utiliser la méthode select
            if (committeeSelector.startsWith("select")) {
              await page.select(committeeSelector, committeeValue).catch((e) => {
                console.log(`Erreur lors de la sélection de la commission: ${e.message}`)
              })
            } else {
              // Sinon, essayer de définir la valeur
              await page.evaluate(
                (selector, value) => {
                  const element = document.querySelector(selector)
                  if (element) element.value = value
                },
                committeeSelector,
                committeeValue,
              )
            }

            // Prendre une capture d'écran après la sélection de la commission
            const afterAlternativeCommitteeSelectionPath = path.join(
              screenshotsDir,
              `${sessionId}-after-alternative-committee-selection.png`,
            )
            await page.screenshot({ path: afterAlternativeCommitteeSelectionPath, fullPage: true })
            const afterAlternativeCommitteeSelectionUrl = `${baseUrl}/public/screenshots/${path.basename(afterAlternativeCommitteeSelectionPath)}`
            screenshotUrls.push({
              name: "Après sélection alternative de commission",
              url: afterAlternativeCommitteeSelectionUrl,
            })
          } else {
            console.log(`Le sélecteur ${committeeSelector} n'existe pas sur la page`)
          }
        }

        // Rechercher le champ de date
        let dateSelector = null
        if (startDate) {
          console.log(`Recherche du champ de date pour: ${startDate}`)

          // Rechercher des champs de date
          const dateFields = await page.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll("input"))
            return inputs
              .filter((input) => {
                return (
                  input.type === "date" ||
                  input.name.toLowerCase().includes("date") ||
                  input.id.toLowerCase().includes("date") ||
                  input.placeholder?.toLowerCase().includes("date")
                )
              })
              .map((input) => {
                return {
                  type: input.type,
                  id: input.id || "no-id",
                  name: input.name || "no-name",
                  placeholder: input.placeholder || "no-placeholder",
                }
              })
          })

          console.log("Champs de date trouvés:", JSON.stringify(dateFields, null, 2))

          // Rechercher un champ de date qui pourrait correspondre à la date de début
          for (const field of dateFields) {
            if (
              field.name.toLowerCase().includes("begin") ||
              field.id.toLowerCase().includes("begin") ||
              field.name.toLowerCase().includes("start") ||
              field.id.toLowerCase().includes("start")
            ) {
              dateSelector = field.name ? `input[name="${field.name}"]` : `input#${field.id}`
              console.log(`Champ de date de début trouvé: ${dateSelector}`)
              break
            }
          }

          // Si aucun champ spécifique n'a été trouvé, prendre le premier champ de date
          if (!dateSelector && dateFields.length > 0) {
            const firstField = dateFields[0]
            dateSelector = firstField.name ? `input[name="${firstField.name}"]` : `input#${firstField.id}`
            console.log(`Aucun champ de date spécifique trouvé, utilisation du premier champ: ${dateSelector}`)
          }

          // Si nous avons un sélecteur de date, essayer de définir la date
          if (dateSelector) {
            // Vérifier si le sélecteur existe sur la page
            const selectorExists = await page.evaluate((selector) => {
              return !!document.querySelector(selector)
            }, dateSelector)

            if (selectorExists) {
              await page.evaluate(
                (selector, date) => {
                  const element = document.querySelector(selector)
                  if (element) element.value = date
                },
                dateSelector,
                startDate,
              )

              // Prendre une capture d'écran après la définition de la date
              const afterAlternativeDateSettingPath = path.join(
                screenshotsDir,
                `${sessionId}-after-alternative-date-setting.png`,
              )
              await page.screenshot({ path: afterAlternativeDateSettingPath, fullPage: true })
              const afterAlternativeDateSettingUrl = `${baseUrl}/public/screenshots/${path.basename(afterAlternativeDateSettingPath)}`
              screenshotUrls.push({
                name: "Après définition alternative de la date",
                url: afterAlternativeDateSettingUrl,
              })
            } else {
              console.log(`Le sélecteur ${dateSelector} n'existe pas sur la page`)
            }
          } else {
            console.log("Aucun champ de date trouvé")
          }
        }

        // Rechercher le bouton de recherche
        const searchButtonInfo = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll("button, input[type='submit'], input[type='button']"))
          return buttons
            .filter((button) => {
              const text = (button.innerText || button.value || "").toLowerCase()
              return (
                text.includes("search") ||
                text.includes("recherche") ||
                text.includes("find") ||
                text.includes("submit") ||
                text.includes("go")
              )
            })
            .map((button) => {
              return {
                type: button.tagName.toLowerCase(),
                id: button.id || "no-id",
                name: button.name || "no-name",
                value: button.value || "no-value",
                text: button.innerText || button.value || "no-text",
              }
            })
        })

        console.log("Boutons de recherche trouvés:", JSON.stringify(searchButtonInfo, null, 2))

        // Si nous avons trouvé des boutons de recherche, cliquer sur le premier
        if (searchButtonInfo.length > 0) {
          const button = searchButtonInfo[0]
          const buttonSelector =
            button.id !== "no-id"
              ? `#${button.id}`
              : button.name !== "no-name"
                ? `[name="${button.name}"]`
                : `button:contains("${button.text}")`

          console.log(`Clic sur le bouton de recherche: ${buttonSelector}`)

          try {
            await Promise.all([
              page.click(buttonSelector).catch((e) => {
                console.log(`Erreur lors du clic sur le bouton: ${e.message}`)
              }),
              waitForNavigationSafely(page, { timeout: 30000 }),
            ])

            // Attendre un peu pour s'assurer que les résultats sont chargés
            await delay(10000)
          } catch (error) {
            console.error("Erreur lors du clic sur le bouton de recherche:", error)
          }
        } else {
          console.log("Aucun bouton de recherche trouvé, tentative de soumettre le formulaire")

          // Essayer de soumettre le premier formulaire
          try {
            await page.evaluate(() => {
              const form = document.querySelector("form")
              if (form) form.submit()
            })

            await waitForNavigationSafely(page, { timeout: 30000 })
            await delay(10000)
          } catch (error) {
            console.error("Erreur lors de la soumission du formulaire:", error)
          }
        }

        // Prendre une capture d'écran des résultats
        const alternativeSearchResultsPath = path.join(screenshotsDir, `${sessionId}-alternative-search-results.png`)
        await page.screenshot({ path: alternativeSearchResultsPath, fullPage: true })
        const alternativeSearchResultsUrl = `${baseUrl}/public/screenshots/${path.basename(alternativeSearchResultsPath)}`
        screenshotUrls.push({ name: "Résultats de recherche alternatifs", url: alternativeSearchResultsUrl })

        // Capturer le HTML des résultats alternatifs
        const alternativeResultsHtmlPath = path.join("/tmp", `${sessionId}-alternative-search-results.html`)
        const alternativeResultsHtmlResult = await capturePageHtml(page, alternativeResultsHtmlPath)
        if (alternativeResultsHtmlResult.screenshotUrl) {
          screenshotUrls.push({
            name: "HTML des résultats alternatifs",
            url: alternativeResultsHtmlResult.screenshotUrl,
          })
        }

        // Extraction alternative des données
        console.log("Tentative d'extraction alternative des résultats")
        const votes = await page
          .evaluate(() => {
            // Essayer de trouver un tableau qui pourrait contenir les résultats
            const tables = Array.from(document.querySelectorAll("table"))
            let resultsTable = null

            // Chercher le tableau qui contient les résultats
            for (const table of tables) {
              const headers = Array.from(table.querySelectorAll("th")).map((th) => th.innerText.trim().toLowerCase())
              if (
                headers.some(
                  (h) =>
                    h.includes("ballot") ||
                    h.includes("vote") ||
                    h.includes("committee") ||
                    h.includes("ref") ||
                    h.includes("status") ||
                    h.includes("result"),
                )
              ) {
                resultsTable = table
                break
              }
            }

            // Si aucun tableau spécifique n'a été trouvé, prendre le tableau le plus grand
            if (!resultsTable && tables.length > 0) {
              let maxRows = 0
              for (const table of tables) {
                const rows = table.querySelectorAll("tr").length
                if (rows > maxRows) {
                  maxRows = rows
                  resultsTable = table
                }
              }
            }

            if (!resultsTable) return []

            // Récupérer les en-têtes
            const headers = Array.from(resultsTable.querySelectorAll("th")).map((th) =>
              th.innerText.trim().toLowerCase(),
            )

            // Récupérer les lignes de données
            const rows = Array.from(resultsTable.querySelectorAll("tbody tr, tr:not(:first-child)"))

            // Extraire les données de chaque ligne
            return rows
              .map((row, index) => {
                const cells = Array.from(row.querySelectorAll("td"))
                if (cells.length < 3) return null // Ignorer les lignes avec trop peu de cellules

                // Créer un objet pour stocker les données
                const rowData = {
                  id: `vote-${index + 1}`,
                  ref: "",
                  title: "",
                  committee: "",
                  votes: "",
                  result: "",
                  status: "",
                  openingDate: "",
                  closingDate: "",
                  role: "",
                  sourceType: "",
                  source: "",
                }

                // Associer les cellules aux en-têtes
                cells.forEach((cell, i) => {
                  const header = headers[i] || `column${i}`
                  const text = cell.innerText.trim()
                  const link = cell.querySelector("a")
                  const href = link ? link.href : null

                  // Déterminer le type de données
                  if (header.includes("ref") || header.includes("reference")) {
                    rowData.ref = text
                    rowData.title = link ? link.title || text : text
                    if (href) {
                      rowData.detailsUrl = href

                      // Extraire l'ID du vote à partir de l'URL ou du lien JavaScript
                      const idMatch = href.match(/id=(\d+)/) || href.match(/(\d+)/)
                      if (idMatch && idMatch[1]) {
                        rowData.voteId = idMatch[1]
                      }

                      // Déterminer le type de vote (npos, ncib, etc.) à partir de l'URL ou du lien JavaScript
                      const typeMatch = href.match(/'([^']+)','doView'/) || href.match(/\/([^/]+)\/ballotAction\.do/)
                      if (typeMatch && typeMatch[1]) {
                        rowData.voteType = typeMatch[1]
                      }
                    }
                  } else if (header.includes("committee")) {
                    rowData.committee = text
                  } else if (header.includes("vote")) {
                    rowData.votes = text
                  } else if (header.includes("result")) {
                    rowData.result = text
                  } else if (header.includes("status")) {
                    rowData.status = text
                  } else if (header.includes("opening")) {
                    rowData.openingDate = text
                  } else if (header.includes("closing")) {
                    rowData.closingDate = text
                  } else if (header.includes("role")) {
                    rowData.role = text
                  } else if (header.includes("source") && header.includes("type")) {
                    rowData.sourceType = text
                  } else if (header.includes("source") && !header.includes("type")) {
                    rowData.source = text
                  } else if (i === 0) {
                    // Première colonne, probablement un identifiant ou une référence
                    rowData.ref = text
                  } else if (i === 1) {
                    // Deuxième colonne, probablement un titre ou une description
                    rowData.title = text
                  }

                  // Stocker l'URL pour les détails si disponible
                  if (href && !rowData.detailsUrl) {
                    rowData.detailsUrl = href
                  }
                })

                return rowData
              })
              .filter(Boolean) // Filtrer les lignes nulles
          })
          .catch((e) => {
            console.log(`Erreur lors de l'extraction alternative des résultats: ${e.message}`)
            return []
          })

        console.log(`${votes.length} votes extraits par méthode alternative`)

        // Fermer le navigateur
        await browser.close()
        browser = null

        // Retourner les résultats avec les URLs des captures d'écran
        return res.json({
          votes,
          debug: {
            receivedCommissionId: commissionId,
            extractedCommissionCode: commissionCode,
            username: username,
            startDate: startDate,
            numVotesGenerated: votes.length,
            alternativeMethod: true,
            sessionId: sessionId,
            screenshotUrls: screenshotUrls,
          },
        })
      }
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
        screenshotUrls: screenshotUrls,
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
      screenshotUrls: screenshotUrls,
    })
  }
})

// Démarrer le serveur
app.listen(port, () => {
  console.log(`API NBN Ballots en écoute sur le port ${port}`)
})
