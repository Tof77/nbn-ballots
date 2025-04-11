import { type NextRequest, NextResponse } from "next/server"
import * as crypto from "crypto"

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
  try {
    const { encryptedData } = await req.json()

    if (!encryptedData) {
      return NextResponse.json({ error: "Données chiffrées manquantes" }, { status: 400 })
    }

    const decryptedData = decryptData(encryptedData)

    return NextResponse.json({ decryptedData })
  } catch (error) {
    console.error("Erreur lors du traitement de la demande:", error)
    return NextResponse.json({ error: "Erreur lors du déchiffrement" }, { status: 500 })
  }
}
