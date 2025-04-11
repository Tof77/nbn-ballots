import { NextResponse } from "next/server"

// Clé publique RSA (à générer et à stocker de manière sécurisée)
// Dans un environnement de production, cette clé devrait être générée et stockée de manière sécurisée
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC7EiRUS/l3eJGqbZjd5hbL4uAH
Eiw2Ty/9VTzAYxtpM+8TN3ORmKRfJgXY3aGK0NbLjHVD59w51n0YQEx4A8qFZYNK
Jk2uQRPDfOZYRbVUU8Vhb1SGxRmkW3+hNL0sMdXnIy5pH8a3+qRdizHzIYFsLvbU
YDIgEkIMKxyhuWJnwwIDAQAB
-----END PUBLIC KEY-----`

export async function GET() {
  return NextResponse.json({ publicKey: PUBLIC_KEY })
}
