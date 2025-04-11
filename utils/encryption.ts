// Cette fonction sera utilisée pour charger la clé publique depuis le serveur
export async function getPublicKey(): Promise<string> {
  try {
    const response = await fetch("/api/public-key")
    const data = await response.json()
    return data.publicKey
  } catch (error) {
    console.error("Erreur lors de la récupération de la clé publique:", error)
    throw new Error("Impossible de récupérer la clé publique")
  }
}

// Cette fonction chiffre les données avec la clé publique RSA
export async function encryptData(data: string, publicKey: string): Promise<string> {
  // Nous utilisons la bibliothèque JSEncrypt qui sera chargée dynamiquement
  const JSEncrypt = (await import("jsencrypt")).default
  const encrypt = new JSEncrypt()
  encrypt.setPublicKey(publicKey)

  // Chiffrer les données
  const encrypted = encrypt.encrypt(data)

  if (!encrypted) {
    throw new Error("Échec du chiffrement des données")
  }

  return encrypted
}

// Cette fonction chiffre les identifiants pour l'API
export async function encryptCredentials(
  username: string,
  password: string,
): Promise<{
  encryptedUsername: string
  encryptedPassword: string
}> {
  try {
    const publicKey = await getPublicKey()

    const encryptedUsername = await encryptData(username, publicKey)
    const encryptedPassword = await encryptData(password, publicKey)

    return {
      encryptedUsername,
      encryptedPassword,
    }
  } catch (error) {
    console.error("Erreur lors du chiffrement des identifiants:", error)
    throw new Error("Impossible de chiffrer les identifiants")
  }
}
