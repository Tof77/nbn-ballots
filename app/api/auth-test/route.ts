import { NextResponse } from "next/server"
import { encryptCredentials } from "@/utils/encryption"

export const runtime = "edge"
export const maxDuration = 30

export async function POST(request: Request) {
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

    // Chiffrer les identifiants pour tester le processus
    const { encryptedUsername, encryptedPassword } = await encryptCredentials(username, password)

    return NextResponse.json({
      success: true,
      message: "Identifiants chiffrés avec succès",
      encryptedUsername: encryptedUsername.substring(0, 10) + "...", // Ne montrer qu'une partie pour la sécurité
      encryptedPassword: encryptedPassword.substring(0, 10) + "...", // Ne montrer qu'une partie pour la sécurité
    })
  } catch (error) {
    console.error("Erreur lors du test d'authentification:", error)
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
