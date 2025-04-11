import { type NextRequest, NextResponse } from "next/server"
import puppeteer from "puppeteer-core"
import chromium from "@sparticuz/chromium"
import * as crypto from "crypto"

// Types pour les votes
interface Vote {
  id: string
  ref: string
  title: string
  committee: string
  sourceCommittee: string
  closingDate: string
  result: string
  status: string
  source: string
  voteDetails?: VoteDetail[]
}

interface VoteDetail {
  participant: string
  vote: string
  castBy: string
  date: string
}

interface EncryptedCredentials {
  encryptedUsername: string
  encryptedPassword: string
}

// Clé privée RSA (à générer et à stocker de manière sécurisée)
// Dans un environnement de production, cette clé devrait être stockée dans une variable d'environnement
const PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIICXQIBAAKBgQC7EiRUS/l3eJGqbZjd5hbL4uAHEiw2Ty/9VTzAYxtpM+8TN3OR
mKRfJgXY3aGK0NbLjHVD59w51n0YQEx4A8qFZYNKJk2uQRPDfOZYRbVUU8Vhb1SG
xRmkW3+hNL0sMdXnIy5pH8a3+qRdizHzIYFsLvbUYDIgEkIMKxyhuWJnwwIDAQAB
AoGBAKBIYsz3aCHSZ6/TTl/ORUoO0xH1v/wn0Gq67KPgpXxOYbRNX5J8HhkZwmMJ
FjQNqKXxcXEYQlPmY5i7Fm/KEb6YXXtDMXvQKZ5QbvMI5/KjIKgYB78HVGlG3wWO
XcbFbGRv+3oVBHf1JIHVpOIwdkG8zGJsQjVKVxlYzUFNiHSRAkEA6MLlGbPOIeG0
KW8xWE4QKImkFdeFzfcS0MIFKQT4v+ycgKbX8MHVS7+yTKYBRDv1M7P5N8NZJDyx
SYGBCkpZ9QJBAMzZV/XkTfOJPxqKvOvJpN3NdSULlCeUNxYYYJCGXzwIQi0Lk9Ck
RRTFvFMBzQn0pFvDUJwlEqKJYiNUKnZHQdcCQQCYbRGvQVsy2rlAcjK6AFN9wcvm
xNNY6+jdLt5nAyzvDGGrCYQlaying8I1CKrOi5PUxpqOoqJWnIZLRXssQqAVAkAj
eiY3vIjJwNAmi6hQ/0rBRQEc9gQN3qwDfxON25fS5eYWegJQJkEF7ra9YI9VDpUy
zjDfr2oYdCJYFaH0BYwfAkAyXuG1xLVzBLFWF8XrYw3a11e3ZFMUimzBHl+/iI2P
6OEPzhbLmcgxjq9hyq5j5vKxJiQMBJGMdPwXUda+E1wo
-----END RSA PRIVATE KEY-----`

// Fonction pour déchiffrer les données avec la clé privée RSA
function decryptData(encryptedData: string): string {
  try {
    const buffer = Buffer.from(encryptedData, "base64")
    const decrypted = crypto.privateDecrypt(
      {
        key: PRIVATE_KEY,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      buffer,
    )
    return decrypted.toString("utf8")
  } catch (error) {
    console.error("Erreur lors du déchiffrement:", error)
    throw new Error("Échec du déchiffrement des données")
  }
}

export async function POST(req: NextRequest) {
  const { commissionId, startDate, extractDetails = true, credentials } = await req.json()

  // Vérifier que les identifiants chiffrés sont fournis
  if (!credentials || !credentials.encryptedUsername || !credentials.encryptedPassword) {
    return NextResponse.json({ error: "Identifiants chiffrés manquants" }, { status: 400 })
  }

  let browser = null

  try {
    // Déchiffrer les identifiants
    const username = decryptData(credentials.encryptedUsername)
    const password = decryptData(credentials.encryptedPassword)

    // Configuration spécifique pour Vercel avec Chromium headless
    browser = await puppeteer.launch({
      args: [...chromium.args, "--hide-scrollbars", "--disable-web-security"],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: true,
      ignoreHTTPSErrors: true,
    })

    const page = await browser.newPage()

    // Naviguer vers la page de login
    await page.goto("https://isolutions.iso.org/login", {
      waitUntil: "networkidle2",
    })

    // Remplir le formulaire de login avec les identifiants déchiffrés
    await page.type("#username", username)
    await page.type("#password", password)

    // Soumettre le formulaire et attendre la navigation
    await Promise.all([page.click("button[type=submit]"), page.waitForNavigation({ waitUntil: "networkidle2" })])

    // Vérifier si la connexion a réussi
    const isLoggedIn = await page.evaluate(() => {
      // Vérifier si nous sommes redirigés vers la page d'accueil ou si un message d'erreur est affiché
      return !document.querySelector(".alert-danger") && !document.querySelector(".login-error")
    })

    if (!isLoggedIn) {
      return NextResponse.json({ error: "Échec de connexion. Vérifiez vos identifiants." }, { status: 401 })
    }

    // Le reste du code reste identique...
    // Naviguer vers la page des ballots
    await page.goto("https://isolutions.iso.org/ballots/part/viewMyBallots.do", {
      waitUntil: "networkidle2",
    })

    // Cliquer sur l'onglet "Search"
    await page.waitForSelector("#tabs0head6")
    await page.click("#tabs0head6")
    await page.waitForTimeout(1000) // Attendre que la page se charge

    // Sélectionner la commission
    await page.waitForSelector('select[name="searchCommitteeId"]')
    await page.select('select[name="searchCommitteeId"]', commissionId)

    // Configurer les filtres de date
    await page.click('input[name="searchOnOpenDate"][value="false"]') // Sélectionner "Closing date"

    // Remplir la date de début
    const fromInput = await page.$('input[name="searchBeginDateString"]')
    await fromInput?.click({ clickCount: 3 })
    await fromInput?.type(startDate)

    // Lancer la recherche
    await Promise.all([page.click('input[value="Search"]'), page.waitForNavigation({ waitUntil: "networkidle2" })])

    // Extraire les résultats de base
    const votes = await page.$$eval("table.listTable tbody tr", (rows) => {
      return Array.from(rows).map((row) => {
        const cells = row.querySelectorAll("td")
        const idLink = cells[2]?.querySelector("a")?.id || ""
        const id = idLink.split("_")[1] || ""

        return {
          id,
          ref: cells[2]?.querySelector("a")?.textContent?.trim() || "",
          committee: cells[1]?.textContent?.trim() || "",
          votes: cells[3]?.textContent?.trim() || "",
          result: cells[4]?.querySelector("a")?.textContent?.trim() || "",
          status: cells[5]?.textContent?.trim() || "",
          openingDate: cells[6]?.textContent?.trim() || "",
          closingDate: cells[7]?.textContent?.trim() || "",
          role: cells[8]?.textContent?.trim() || "",
          sourceType: cells[9]?.textContent?.trim() || "",
          source: cells[10]?.textContent?.trim() || "",
          voteDetails: [],
        }
      })
    })

    // Pour chaque vote, ouvrir la page de détail et extraire les informations supplémentaires
    const detailedVotes = []

    // Limiter à 5 votes pour éviter les timeouts (à ajuster selon les besoins)
    const votesToProcess = extractDetails ? votes.slice(0, 5) : []

    for (const vote of votesToProcess) {
      try {
        // Ouvrir la page de détail du vote
        await page.goto(`https://isolutions.iso.org/ballots/part/npos/ballotAction.do?method=doView&id=${vote.id}`, {
          waitUntil: "networkidle2",
        })

        // Extraire le titre complet
        const title = await page.evaluate(() => {
          const titleElement = document.querySelector('td.content[colspan="3"]')
          return titleElement?.textContent?.trim() || ""
        })

        // Extraire les détails des votes
        const voteDetails = await page.$$eval(
          "table#cmOpinionArea tbody tr.rowList0, table#cmOpinionArea tbody tr.rowList1",
          (rows) => {
            return Array.from(rows).map((row) => {
              const cells = row.querySelectorAll("td")
              const participantCell = cells[1]
              const participant = participantCell?.querySelector("span.part")?.textContent?.trim() || ""

              // Extraire le vote (support ou non)
              const voteText =
                participantCell?.querySelector("table tbody tr:nth-child(2) td:nth-child(2)")?.textContent?.trim() || ""

              return {
                participant,
                vote: voteText,
                castBy: cells[2]?.textContent?.trim() || "",
                date: cells[3]?.textContent?.trim() || "",
              }
            })
          },
        )

        detailedVotes.push({
          ...vote,
          title,
          voteDetails,
        })
      } catch (error) {
        console.error(`Erreur lors de l'extraction des détails pour le vote ${vote.id}:`, error)
        detailedVotes.push(vote)
      }
    }

    return NextResponse.json({ votes: extractDetails ? detailedVotes : votes })
  } catch (error) {
    console.error("Erreur lors de l'extraction:", error)
    return NextResponse.json({ error: "Erreur lors de l'extraction des votes" }, { status: 500 })
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}
