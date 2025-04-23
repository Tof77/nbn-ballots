import { type NextRequest, NextResponse } from "next/server"
import puppeteer from "puppeteer"

export async function POST(req: NextRequest) {
  let browser = null
  const screenshotUrls = []

  try {
    const { username, password } = await req.json()

    if (!username || !password) {
      return NextResponse.json({ error: "Les identifiants sont requis" }, { status: 400 })
    }

    // Lancer Puppeteer
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    })

    const page = await browser.newPage()

    // Activer la journalisation de la console du navigateur
    page.on("console", (msg) => console.log("Console du navigateur:", msg.text()))

    // Naviguer vers ISO
    await page.goto("https://isolutions.iso.org", {
      waitUntil: "networkidle2",
      timeout: 60000,
    })

    // Attendre que la page soit chargée
    await new Promise((resolve) => setTimeout(resolve, 5000))

    // Prendre une capture d'écran
    await page.screenshot({ path: "/tmp/initial-page.png" })

    // Vérifier si nous sommes sur la page de connexion
    const currentUrl = page.url()
    const isOnLoginPage = currentUrl.includes("idp.iso.org")

    if (isOnLoginPage) {
      // Trouver les champs de connexion
      const usernameSelector = await page.evaluate(() => {
        const selectors = ["#username", 'input[name="username"]', 'input[type="text"]']
        for (const selector of selectors) {
          if (document.querySelector(selector)) return selector
        }
        return null
      })

      const passwordSelector = await page.evaluate(() => {
        const selectors = ["#password", 'input[name="password"]', 'input[type="password"]']
        for (const selector of selectors) {
          if (document.querySelector(selector)) return selector
        }
        return null
      })

      if (!usernameSelector || !passwordSelector) {
        throw new Error("Impossible de trouver les champs de connexion")
      }

      // Remplir les champs de connexion
      await page.type(usernameSelector, username)
      await page.type(passwordSelector, password)

      // Trouver le bouton de connexion
      const loginButtonSelector = await page.evaluate(() => {
        const selectors = ['input[type="submit"]', 'button[type="submit"]', "button.submit"]
        for (const selector of selectors) {
          if (document.querySelector(selector)) return selector
        }
        return null
      })

      if (!loginButtonSelector) {
        throw new Error("Impossible de trouver le bouton de connexion")
      }

      // Cliquer sur le bouton de connexion
      await Promise.all([
        page.click(loginButtonSelector),
        page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch((e) => {
          console.log(`Erreur lors de l'attente de navigation: ${e.message}`)
        }),
      ])

      // Attendre un peu
      await new Promise((resolve) => setTimeout(resolve, 10000))

      // Prendre une capture d'écran après la connexion
      await page.screenshot({ path: "/tmp/after-login.png" })

      // Vérifier si nous sommes toujours sur la page de connexion
      const afterLoginUrl = page.url()
      if (afterLoginUrl.includes("idp.iso.org")) {
        // Vérifier s'il y a un message d'erreur
        const errorMessage = await page.evaluate(() => {
          const errorElements = Array.from(
            document.querySelectorAll('.alert-error, .error, .alert-danger, [role="alert"]'),
          )
          return errorElements.map((el) => el.textContent.trim()).join(" ")
        })

        if (errorMessage) {
          throw new Error(`Échec de la connexion: ${errorMessage}`)
        } else {
          throw new Error("Échec de la connexion. Vérifiez vos identifiants.")
        }
      }

      // Vérifier si nous sommes sur une page ISO
      const isOnIsoPage = afterLoginUrl.includes("isolutions.iso.org")
      if (!isOnIsoPage) {
        throw new Error("Redirection après connexion incorrecte")
      }

      return NextResponse.json({
        success: true,
        message: "Connexion réussie",
        url: afterLoginUrl,
      })
    } else {
      return NextResponse.json({
        success: false,
        message: "Pas sur la page de connexion",
        url: currentUrl,
      })
    }
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Erreur inconnue",
        details: error.stack,
      },
      { status: 500 },
    )
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}
