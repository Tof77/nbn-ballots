import { NextResponse } from "next/server"
import puppeteer from "puppeteer"
import path from "path"
import fs from "fs"
import os from "os"

export const maxDuration = 60

export async function POST(request: Request) {
  let browser = null
  const screenshotUrls = []
  const tempDir = path.join(os.tmpdir(), "nbn-ballots-test")

  // Créer le répertoire temporaire s'il n'existe pas
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }

  try {
    const { username, password } = await request.json()

    if (!username || !password) {
      return NextResponse.json(
        {
          success: false,
          message: "Identifiant et mot de passe requis",
        },
        { status: 400 },
      )
    }

    // Lancer Puppeteer pour tester la connexion
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    })

    const page = await browser.newPage()

    // Naviguer vers la page de connexion ISO
    await page.goto("https://isolutions.iso.org", {
      waitUntil: "networkidle2",
      timeout: 60000,
    })

    // Attendre que la page soit chargée
    await new Promise((resolve) => setTimeout(resolve, 5000))

    // Prendre une capture d'écran initiale
    const initialScreenshotPath = path.join(tempDir, "initial-page.png")
    await page.screenshot({ path: initialScreenshotPath, fullPage: true })
    screenshotUrls.push({ name: "Page initiale", path: initialScreenshotPath })

    // Vérifier si nous sommes sur la page de connexion
    const currentUrl = page.url()
    const isOnLoginPage = currentUrl.includes("idp.iso.org")

    if (!isOnLoginPage) {
      await browser.close()
      return NextResponse.json({
        success: false,
        message: "Non redirigé vers la page de connexion",
        currentUrl,
        screenshotUrls,
      })
    }

    // Trouver les champs de connexion
    const usernameSelector = await page.evaluate(() => {
      const selectors = ["#username", 'input[name="username"]', 'input[type="text"]', 'input[id="username"]']
      for (const selector of selectors) {
        if (document.querySelector(selector)) return selector
      }
      return null
    })

    const passwordSelector = await page.evaluate(() => {
      const selectors = ["#password", 'input[name="password"]', 'input[type="password"]', 'input[id="password"]']
      for (const selector of selectors) {
        if (document.querySelector(selector)) return selector
      }
      return null
    })

    if (!usernameSelector || !passwordSelector) {
      await browser.close()
      return NextResponse.json({
        success: false,
        message: "Impossible de trouver les champs de connexion",
        usernameSelector,
        passwordSelector,
        screenshotUrls,
      })
    }

    // Remplir les champs de connexion
    await page.type(usernameSelector, username)
    await page.type(passwordSelector, password)

    // Trouver le bouton de connexion
    const loginButtonSelector = await page.evaluate(() => {
      const selectors = ['input[type="submit"]', 'button[type="submit"]', "button.submit", "button.login"]
      for (const selector of selectors) {
        if (document.querySelector(selector)) return selector
      }
      return null
    })

    if (!loginButtonSelector) {
      await browser.close()
      return NextResponse.json({
        success: false,
        message: "Impossible de trouver le bouton de connexion",
        screenshotUrls,
      })
    }

    // Prendre une capture d'écran avant de cliquer sur le bouton
    const beforeLoginScreenshotPath = path.join(tempDir, "before-login.png")
    await page.screenshot({ path: beforeLoginScreenshotPath, fullPage: true })
    screenshotUrls.push({ name: "Avant connexion", path: beforeLoginScreenshotPath })

    // Cliquer sur le bouton de connexion
    await Promise.all([
      page.click(loginButtonSelector),
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {
        console.log("Timeout lors de l'attente de navigation après connexion")
      }),
    ])

    // Attendre un peu pour s'assurer que la page est chargée
    await new Promise((resolve) => setTimeout(resolve, 5000))

    // Prendre une capture d'écran après la connexion
    const afterLoginScreenshotPath = path.join(tempDir, "after-login.png")
    await page.screenshot({ path: afterLoginScreenshotPath, fullPage: true })
    screenshotUrls.push({ name: "Après connexion", path: afterLoginScreenshotPath })

    // Vérifier si la connexion a réussi
    const afterLoginUrl = page.url()
    const loginSuccessful = !afterLoginUrl.includes("idp.iso.org") && afterLoginUrl.includes("isolutions.iso.org")

    // Vérifier s'il y a un message d'erreur
    const errorMessage = await page.evaluate(() => {
      const errorElements = Array.from(document.querySelectorAll('.alert-error, .error, .alert-danger, [role="alert"]'))
      return errorElements.map((el) => el.textContent.trim()).join(" ")
    })

    await browser.close()

    return NextResponse.json({
      success: loginSuccessful,
      message: loginSuccessful
        ? "Connexion réussie"
        : errorMessage
          ? `Échec de la connexion: ${errorMessage}`
          : "Échec de la connexion pour une raison inconnue",
      initialUrl: currentUrl,
      finalUrl: afterLoginUrl,
      errorMessage,
      screenshotPaths: screenshotUrls.map((s) => s.path),
    })
  } catch (error) {
    console.error("Erreur lors du test de connexion manuelle:", error)

    if (browser) {
      await browser.close()
    }

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : String(error),
        screenshotPaths: screenshotUrls.map((s) => s.path),
      },
      { status: 500 },
    )
  }
}
