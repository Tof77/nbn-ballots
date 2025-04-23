import { NextResponse } from "next/server"

export const runtime = "edge"
export const maxDuration = 30

export async function POST(request: Request) {
  try {
    const { credentials } = await request.json()

    if (!credentials || !credentials.encryptedUsername || !credentials.encryptedPassword) {
      return NextResponse.json(
        {
          success: false,
          message: "Identifiants chiffrés manquants",
        },
        { status: 400 },
      )
    }

    // Analyser les identifiants chiffrés sans les exposer complètement
    const usernameInfo = {
      length: credentials.encryptedUsername.length,
      firstChar: credentials.encryptedUsername.charAt(0),
      lastChar: credentials.encryptedUsername.charAt(credentials.encryptedUsername.length - 1),
      containsSpecialChars: /[^a-zA-Z0-9]/.test(credentials.encryptedUsername),
    }

    const passwordInfo = {
      length: credentials.encryptedPassword.length,
      firstChar: credentials.encryptedPassword.charAt(0),
      lastChar: credentials.encryptedPassword.charAt(credentials.encryptedPassword.length - 1),
      containsSpecialChars: /[^a-zA-Z0-9]/.test(credentials.encryptedPassword),
    }

    return NextResponse.json({
      success: true,
      message: "Analyse des identifiants chiffrés",
      usernameInfo,
      passwordInfo,
    })
  } catch (error) {
    console.error("Erreur lors de l'analyse des identifiants:", error)
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
