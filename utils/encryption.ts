// This function will be used to load the public key from the server
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

// This function encrypts the data with the RSA public key
export async function encryptData(data: string, publicKey: string): Promise<string> {
  // We use the JSEncrypt library which will be loaded dynamically
  const JSEncrypt = (await import("jsencrypt")).default
  const encrypt = new JSEncrypt()
  encrypt.setPublicKey(publicKey)

  // Encrypt the data
  const encrypted = encrypt.encrypt(data)

  if (!encrypted) {
    throw new Error("Échec du chiffrement des données")
  }

  return encrypted
}

// This function simulates encryption for the demo mode
export async function simulateEncryption(text: string): Promise<string> {
  // Simple base64 encoding to simulate encryption
  return btoa(`demo:${text}`)
}

// This function decrypts the simulated data
export function simulateDecryption(encryptedData: string): string {
  try {
    // Base64 decoding and verification of the "demo:" prefix
    const decoded = atob(encryptedData)
    if (!decoded.startsWith("demo:")) {
      throw new Error("Format de données invalide")
    }
    return decoded.substring(5) // Remove the "demo:" prefix
  } catch (error: any) {
    console.error("Erreur lors du déchiffrement simulé:", error)
    throw new Error("Échec du déchiffrement des données")
  }
}

// This function encrypts the credentials for the API
export async function encryptCredentials(
  username: string,
  password: string,
): Promise<{
  encryptedUsername: string
  encryptedPassword: string
}> {
  try {
    // For the demo deployment, use a simulated encryption
    const encryptedUsername = await simulateEncryption(username)
    const encryptedPassword = await simulateEncryption(password)

    return {
      encryptedUsername,
      encryptedPassword,
    }
  } catch (error) {
    console.error("Erreur lors du chiffrement des identifiants:", error)
    throw new Error("Impossible de chiffrer les identifiants")
  }
}

// This function decrypts the credentials
export async function decryptCredentials(
  encryptedUsername: string,
  encryptedPassword: string,
): Promise<{
  decryptedUsername: string
  decryptedPassword: string
}> {
  try {
    const decryptedUsername = simulateDecryption(encryptedUsername)
    const decryptedPassword = simulateDecryption(encryptedPassword)

    return {
      decryptedUsername,
      decryptedPassword,
    }
  } catch (error) {
    console.error("Erreur lors du déchiffrement des identifiants:", error)
    throw new Error("Impossible de déchiffrer les identifiants")
  }
}
