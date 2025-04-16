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

      // Analyser la structure de la page pour trouver les formulaires et les champs
      const formInfo = await page.evaluate(() => {
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
          committeeSelector = firstSelector.name ? `select[name="${firstSelector.name}"]` : `select#${firstSelector.id}`
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

      // Si nous n'avons toujours pas de sélecteur, essayer de trouver un bouton ou un lien pour la commission
      if (!committeeSelector) {
        // Rechercher des boutons ou des liens qui pourraient être liés à la sélection de commission
        const buttonOrLinkInfo = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll("button, input[type='button'], input[type='submit']"))
          const buttonDetails = buttons.map((button) => {
            return {
              type: button.tagName.toLowerCase(),
              id: button.id || "no-id",
              name: button.name || "no-name",
              value: button.value || "no-value",
              text: button.innerText || button.value || "no-text",
            }
          })

          const links = Array.from(document.querySelectorAll("a"))
          const linkDetails = links.map((link) => {
            return {
              href: link.href || "no-href",
              id: link.id || "no-id",
              text: link.innerText || "no-text",
            }
          })

          return {
            buttons: buttonDetails,
            links: linkDetails,
          }
        })

        console.log("Informations sur les boutons et liens:", JSON.stringify(buttonOrLinkInfo, null, 2))

        // Rechercher un bouton ou un lien qui pourrait être lié à la sélection de commission
        for (const button of buttonOrLinkInfo.buttons) {
          if (
            button.text.toLowerCase().includes("committee") ||
            button.text.toLowerCase().includes("comite") ||
            button.name.toLowerCase().includes("committee") ||
            button.id.toLowerCase().includes("committee")
          ) {
            console.log(`Bouton de commission trouvé: ${button.text}`)
            // Cliquer sur le bouton
            await page.click(
              button.id !== "no-id"
                ? `#${button.id}`
                : button.name !== "no-name"
                  ? `[name="${button.name}"]`
                  : `button:contains("${button.text}")`,
            )
            await delay(3000)
            break
          }
        }

        for (const link of buttonOrLinkInfo.links) {
          if (
            link.text.toLowerCase().includes("committee") ||
            link.text.toLowerCase().includes("comite") ||
            link.href.toLowerCase().includes("committee")
          ) {
            console.log(`Lien de commission trouvé: ${link.text}`)
            // Cliquer sur le lien
            await page.click(link.id !== "no-id" ? `#${link.id}` : `a:contains("${link.text}")`).catch((e) => {
              console.log(`Erreur lors du clic sur le lien: ${e.message}`)
            })
            await delay(3000)
            break
          }
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
        } else {
          console.log(`Le sélecteur ${committeeSelector} n'existe pas sur la page`)
        }
      } else {
        console.log("Aucun sélecteur de commission trouvé, tentative de continuer sans sélection de commission")
      }

      // Définir la date si demandé
      if (startDate) {
        console.log(`Définition de la date: ${startDate}`)

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

        // Rechercher un champ de date qui pourrait correspondre à la date de clôture
        let dateSelector = null
        for (const field of dateFields) {
          if (
            field.name.toLowerCase().includes("closing") ||
            field.id.toLowerCase().includes("closing") ||
            field.name.toLowerCase().includes("clos") ||
            field.id.toLowerCase().includes("clos") ||
            field.placeholder?.toLowerCase().includes("closing")
          ) {
            dateSelector = field.name ? `input[name="${field.name}"]` : `input#${field.id}`
            console.log(`Champ de date de clôture trouvé: ${dateSelector}`)
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

        await Promise.all([
          page.click(buttonSelector).catch((e) => {
            console.log(`Erreur lors du clic sur le bouton: ${e.message}`)
          }),
          page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch((e) => {
            console.log(`Navigation non détectée après recherche: ${e.message}`)
          }),
        ])
      } else {
        console.log("Aucun bouton de recherche trouvé, tentative de soumettre le formulaire")

        // Essayer de soumettre le premier formulaire
        await page.evaluate(() => {
          const form = document.querySelector("form")
          if (form) form.submit()
        })

        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch((e) => {
          console.log(`Navigation non détectée après soumission du formulaire: ${e.message}`)
        })
      }

      // Attendre un peu pour s'assurer que les résultats sont chargés
      await delay(5000)

      // Prendre une capture d'écran des résultats
      await page.screenshot({ path: "/tmp/search-results.png" })
      await capturePageHtml(page, "/tmp/search-results.html")

      // Analyser la structure de la page pour trouver les tableaux
      const tableInfo = await page.evaluate(() => {
        const tables = Array.from(document.querySelectorAll("table"))
        return tables.map((table, index) => {
          // Récupérer les en-têtes du tableau
          const headers = Array.from(table.querySelectorAll("th, thead td")).map((th) => th.innerText.trim())

          // Récupérer le nombre de lignes
          const rows = table.querySelectorAll("tbody tr, tr").length

          return {
            index,
            id: table.id || "no-id",
            className: table.className || "no-class",
            headers,
            rows,
          }
        })
      })

      console.log("Tableaux trouvés:", JSON.stringify(tableInfo, null, 2))

      // Trouver le tableau qui contient les résultats
      let resultTableIndex = -1
      for (let i = 0; i < tableInfo.length; i++) {
        const table = tableInfo[i]
        // Vérifier si les en-têtes du tableau contiennent des mots-clés liés aux votes
        const headers = table.headers.map((h) => h.toLowerCase())
        if (
          headers.some(
            (h) =>
              h.includes("ballot") ||
              h.includes("vote") ||
              h.includes("committee") ||
              h.includes("ref") ||
              h.includes("status") ||
              h.includes("result"),
          ) &&
          table.rows > 1 // Le tableau doit avoir au moins une ligne de données
        ) {
          resultTableIndex = i
          console.log(`Tableau de résultats trouvé à l'index ${i}`)
          break
        }
      }

      // Si aucun tableau spécifique n'a été trouvé, prendre le tableau le plus grand
      if (resultTableIndex === -1 && tableInfo.length > 0) {
        // Trouver le tableau avec le plus de lignes
        let maxRows = 0
        for (let i = 0; i < tableInfo.length; i++) {
          if (tableInfo[i].rows > maxRows) {
            maxRows = tableInfo[i].rows
            resultTableIndex = i
          }
        }
        console.log(
          `Aucun tableau spécifique trouvé, utilisation du tableau avec le plus de lignes (${maxRows}) à l'index ${resultTableIndex}`,
        )
      }

      // Extraire les résultats
      console.log("Extraction des résultats...")
      let votes = []

      if (resultTableIndex !== -1) {
        // Extraire les données du tableau
        votes = await page.evaluate((tableIndex) => {
          const tables = document.querySelectorAll("table")
          const table = tables[tableIndex]
          const results = []

          // Récupérer les en-têtes du tableau
          const headers = Array.from(table.querySelectorAll("th, thead td")).map((th) =>
            th.innerText.trim().toLowerCase(),
          )

          // Récupérer les lignes de données
          const rows = table.querySelectorAll("tbody tr, tr:not(:first-child)")

          rows.forEach((row, index) => {
            const cells = row.querySelectorAll("td")
            if (cells.length < 3) return // Ignorer les lignes avec trop peu de cellules

            // Créer un objet pour stocker les données de la ligne
            const rowData = {
              id: `vote-${index + 1}`,
            }

            // Parcourir les cellules et les associer aux en-têtes
            for (let i = 0; i < cells.length; i++) {
              const cell = cells[i]
              const header = i < headers.length ? headers[i] : `column${i}`

              // Extraire le texte et les liens
              const text = cell.innerText.trim()
              const link = cell.querySelector("a")
              const href = link ? link.href : null

              // Déterminer le type de données en fonction de l'en-tête
              if (header.includes("ref") || header.includes("reference") || header.includes("title")) {
                rowData.ref = text
                rowData.title = link ? link.title || text : text
              } else if (header.includes("committee")) {
                rowData.committee = text
              } else if (header.includes("votes")) {
                rowData.votes = text
              } else if (header.includes("result")) {
                rowData.result = text
              } else if (header.includes("status")) {
                rowData.status = text
              } else if (header.includes("opening") || header.includes("start")) {
                rowData.openingDate = text
              } else if (header.includes("closing") || header.includes("end")) {
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
            }

            // S'assurer que toutes les propriétés requises sont présentes
            if (!rowData.ref) rowData.ref = ""
            if (!rowData.title) rowData.title = ""
            if (!rowData.committee) rowData.committee = ""
            if (!rowData.votes) rowData.votes = ""
            if (!rowData.result) rowData.result = ""
            if (!rowData.status) rowData.status = ""
            if (!rowData.openingDate) rowData.openingDate = ""
            if (!rowData.closingDate) rowData.closingDate = ""
            if (!rowData.role) rowData.role = ""
            if (!rowData.sourceType) rowData.sourceType = ""
            if (!rowData.source) rowData.source = ""

            results.push(rowData)
          })

          return results
        }, resultTableIndex)

        console.log(`${votes.length} votes extraits`)
      } else {
        console.log("Aucun tableau de résultats trouvé, tentative d'extraction alternative")

        // Extraction alternative des données
        votes = await page.evaluate(() => {
          const results = []

          // Rechercher des éléments qui pourraient contenir des informations sur les votes
          const voteElements = document.querySelectorAll(
            ".ballot, .vote, [id*='ballot'], [id*='vote'], [class*='ballot'], [class*='vote'], div.row, li.item",
          )

          voteElements.forEach((element, index) => {
            // Extraire les informations disponibles
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

            // Extraire le texte de l'élément
            const text = element.innerText

            // Essayer d'extraire des informations à partir du texte
            const lines = text.split("\n")
            if (lines.length > 0) rowData.ref = lines[0].trim()
            if (lines.length > 1) rowData.title = lines[1].trim()

            // Rechercher des mots-clés dans le texte
            if (text.includes("Committee:")) {
              const match = text.match(/Committee:\s*([^\n]+)/)
              if (match) rowData.committee = match[1].trim()
            }

            if (text.includes("Status:")) {
              const match = text.match(/Status:\s*([^\n]+)/)
              if (match) rowData.status = match[1].trim()
            }

            if (text.includes("Result:")) {
              const match = text.match(/Result:\s*([^\n]+)/)
              if (match) rowData.result = match[1].trim()
            }

            if (text.includes("Opening:") || text.includes("Start:")) {
              const match = text.match(/(Opening|Start):\s*([^\n]+)/)
              if (match) rowData.openingDate = match[2].trim()
            }

            if (text.includes("Closing:") || text.includes("End:")) {
              const match = text.match(/(Closing|End):\s*([^\n]+)/)
              if (match) rowData.closingDate = match[2].trim()
            }

            // Extraire les liens
            const links = element.querySelectorAll("a")
            links.forEach((link) => {
              const linkText = link.innerText.trim()
              const href = link.href

              // Si le lien contient du texte qui ressemble à une référence, l'utiliser comme référence
              if (linkText.match(/[A-Z]+\/[0-9]+/) || linkText.includes("ISO") || linkText.includes("EN")) {
                rowData.ref = linkText
                rowData.detailsUrl = href
              }
            })

            results.push(rowData)
          })

          return results
        })

        console.log(`${votes.length} votes extraits par méthode alternative`)
      }

      // Extraire les détails des votes si demandé
      if (extractDetails && votes.length > 0) {
        console.log("Extraction des détails des votes...")

        for (let i = 0; i < votes.length; i++) {
          const vote = votes[i]

          // Vérifier si le vote a des détails à extraire et une URL de détails
          if (vote.votes && vote.votes.includes("vote") && vote.detailsUrl) {
            console.log(`Extraction des détails pour le vote ${i + 1}/${votes.length}: ${vote.ref}`)

            // Naviguer vers la page de détails
            await page.goto(vote.detailsUrl, { waitUntil: "networkidle2", timeout: 30000 }).catch(async (error) => {
              console.error(`Erreur lors de la navigation vers les détails du vote ${vote.ref}:`, error)
              // Continuer avec le vote suivant
              return
            })

            // Attendre que la page de détails soit chargée
            await delay(3000)

            // Prendre une capture d'écran de la page de détails
            await page.screenshot({ path: `/tmp/vote-details-${i}.png` })
            await capturePageHtml(page, `/tmp/vote-details-${i}.html`)

            // Analyser la structure de la page pour trouver les tableaux
            const detailsTableInfo = await page.evaluate(() => {
              const tables = Array.from(document.querySelectorAll("table"))
              return tables.map((table, index) => {
                // Récupérer les en-têtes du tableau
                const headers = Array.from(table.querySelectorAll("th, thead td")).map((th) => th.innerText.trim())

                // Récupérer le nombre de lignes
                const rows = table.querySelectorAll("tbody tr, tr").length

                return {
                  index,
                  id: table.id || "no-id",
                  className: table.className || "no-class",
                  headers,
                  rows,
                }
              })
            })

            console.log(`Tableaux trouvés sur la page de détails:`, JSON.stringify(detailsTableInfo, null, 2))

            // Trouver le tableau qui contient les détails des votes
            let detailsTableIndex = -1
            for (let j = 0; j < detailsTableInfo.length; j++) {
              const table = detailsTableInfo[j]
              // Vérifier si les en-têtes du tableau contiennent des mots-clés liés aux détails des votes
              const headers = table.headers.map((h) => h.toLowerCase())
              if (
                headers.some(
                  (h) => h.includes("participant") || h.includes("vote") || h.includes("cast") || h.includes("date"),
                ) &&
                table.rows > 1 // Le tableau doit avoir au moins une ligne de données
              ) {
                detailsTableIndex = j
                console.log(`Tableau de détails trouvé à l'index ${j}`)
                break
              }
            }

            // Si aucun tableau spécifique n'a été trouvé, prendre le tableau le plus grand
            if (detailsTableIndex === -1 && detailsTableInfo.length > 0) {
              // Trouver le tableau avec le plus de lignes
              let maxRows = 0
              for (let j = 0; j < detailsTableInfo.length; j++) {
                if (detailsTableInfo[j].rows > maxRows) {
                  maxRows = detailsTableInfo[j].rows
                  detailsTableIndex = j
                }
              }
              console.log(
                `Aucun tableau de détails spécifique trouvé, utilisation du tableau avec le plus de lignes (${maxRows}) à l'index ${detailsTableIndex}`,
              )
            }

            if (detailsTableIndex !== -1) {
              // Extraire les détails du tableau
              vote.voteDetails = await page.evaluate((tableIndex) => {
                const tables = document.querySelectorAll("table")
                const table = tables[tableIndex]
                const details = []

                // Récupérer les en-têtes du tableau
                const headers = Array.from(table.querySelectorAll("th, thead td")).map((th) =>
                  th.innerText.trim().toLowerCase(),
                )

                // Récupérer les lignes de données
                const rows = table.querySelectorAll("tbody tr, tr:not(:first-child)")

                rows.forEach((row) => {
                  const cells = row.querySelectorAll("td")
                  if (cells.length < 3) return // Ignorer les lignes avec trop peu de cellules

                  // Créer un objet pour stocker les données de la ligne
                  const rowData = {}

                  // Parcourir les cellules et les associer aux en-têtes
                  for (let i = 0; i < cells.length; i++) {
                    const cell = cells[i]
                    const header = i < headers.length ? headers[i] : `column${i}`
                    const text = cell.innerText.trim()

                    // Déterminer le type de données en fonction de l'en-tête
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
                  }

                  // S'assurer que toutes les propriétés requises sont présentes
                  if (!rowData.participant) rowData.participant = ""
                  if (!rowData.vote) rowData.vote = ""
                  if (!rowData.castBy) rowData.castBy = ""
                  if (!rowData.date) rowData.date = ""

                  details.push(rowData)
                })

                return details
              }, detailsTableIndex)

              console.log(`${vote.voteDetails.length} détails extraits pour le vote ${vote.ref}`)
            } else {
              console.log(`Aucun tableau de détails trouvé pour le vote ${vote.ref}`)
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
