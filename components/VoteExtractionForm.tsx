"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Loader2, ShieldIcon, BugIcon } from "lucide-react"
import { encryptCredentials } from "@/utils/encryption"

// Ajouter une nouvelle fonction pour réchauffer l'API Render avant l'extraction
// Ajouter cette fonction après les imports et avant la définition du composant

async function warmupRenderApi(): Promise<boolean> {
  try {
    console.log("Réchauffement de l'API Render...")
    const response = await fetch("/api/warmup-render")
    const data = await response.json()
    console.log("Résultat du réchauffement:", data)
    return data.success === true
  } catch (error) {
    console.error("Erreur lors du réchauffement:", error)
    return false
  }
}

interface VoteExtractionFormProps {
  onResultsReceived: (results: any[]) => void
}

export default function VoteExtractionForm({ onResultsReceived }: VoteExtractionFormProps) {
  const [commissionId, setCommissionId] = useState("")
  const [startDate, setStartDate] = useState("")
  const [extractDetails, setExtractDetails] = useState(true)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [publicKeyLoaded, setPublicKeyLoaded] = useState(false)
  const [debugInfo, setDebugInfo] = useState<string | null>(null)
  const [showDebug, setShowDebug] = useState(false)

  // Vérifier que la clé publique est disponible au chargement du composant
  useEffect(() => {
    async function checkPublicKey() {
      try {
        const response = await fetch("/api/public-key")
        if (response.ok) {
          setPublicKeyLoaded(true)
        } else {
          setError("Impossible de charger la clé publique pour le chiffrement")
        }
      } catch (err) {
        setError("Erreur lors de la vérification de la clé publique")
      }
    }

    checkPublicKey()
  }, [])

  // Modifier la fonction handleSubmit pour utiliser le réchauffement
  // Remplacer la fonction handleSubmit existante par celle-ci

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setDebugInfo(null)

    try {
      // Réchauffer l'API Render avant de l'utiliser
      setDebugInfo("Réchauffement de l'API Render...")
      const warmupSuccess = await warmupRenderApi()
      setDebugInfo((prev) => `${prev}\n\nRéchauffement de l'API Render: ${warmupSuccess ? "Succès" : "Échec"}`)

      // Attendre un peu après le réchauffement
      if (warmupSuccess) {
        setDebugInfo((prev) => `${prev}\nAttente de 2 secondes après le réchauffement...`)
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }

      // Chiffrer les identifiants avant de les envoyer
      const { encryptedUsername, encryptedPassword } = await encryptCredentials(username, password)

      // Préparer les données à envoyer
      const requestData = {
        commissionId,
        startDate,
        extractDetails,
        credentials: {
          encryptedUsername,
          encryptedPassword,
        },
      }

      // Journaliser les données envoyées (sans les identifiants sensibles)
      const debugRequestData = {
        ...requestData,
        credentials: {
          encryptedUsername: "***HIDDEN***",
          encryptedPassword: "***HIDDEN***",
        },
      }

      console.log("Données envoyées à l'API:", debugRequestData)
      setDebugInfo((prev) => `${prev}\n\nDonnées envoyées à l'API: ${JSON.stringify(debugRequestData, null, 2)}`)

      // Utiliser directement l'API sans passer par le middleware pour le débogage
      const apiUrl = "/api/extract-votes"

      // Ajouter des logs pour le débogage
      console.log("URL de l'API utilisée:", apiUrl)
      setDebugInfo((prev) => `${prev}\n\nURL de l'API utilisée: ${apiUrl}`)

      try {
        // Tester d'abord avec une requête GET à l'API de test
        const testResponse = await fetch("/api/test")
        const testText = await testResponse.text()
        console.log("Test API response:", testText)
        setDebugInfo((prev) => `${prev}\n\nTest API response: ${testText}`)
      } catch (testError) {
        console.error("Erreur lors du test de l'API:", testError)
        setDebugInfo((prev) => `${prev}\n\nErreur lors du test de l'API: ${testError}`)
      }

      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestData),
      })

      // Ajouter des logs pour le débogage
      console.log("Statut de la réponse:", res.status, res.statusText)
      setDebugInfo((prev) => `${prev}\n\nStatut de la réponse: ${res.status} ${res.statusText}`)

      const responseText = await res.text()
      console.log("Réponse brute de l'API:", responseText)
      setDebugInfo((prev) => `${prev}\n\nRéponse brute de l'API: ${responseText}`)

      let json
      try {
        json = JSON.parse(responseText)
        console.log("Réponse JSON parsée:", json)
        setDebugInfo((prev) => `${prev}\n\nRéponse JSON parsée: ${JSON.stringify(json, null, 2)}`)
      } catch (parseError) {
        console.error("Erreur lors du parsing de la réponse JSON:", parseError)
        setDebugInfo(
          (prev) =>
            `${prev}\n\nErreur lors du parsing de la réponse JSON: ${parseError}\nRéponse brute de l'API (non-JSON): ${responseText}`,
        )
        throw new Error("La réponse de l'API n'est pas un JSON valide")
      }

      if (!res.ok) {
        setDebugInfo((prev) => `${prev}\n\nErreur de l'API: ${JSON.stringify(json, null, 2)}`)
        throw new Error(json.error || "Erreur lors de l'extraction")
      }

      console.log("Réponse de l'API:", json)
      setDebugInfo((prev) => `${prev}\n\nRéponse de l'API: ${JSON.stringify(json, null, 2)}`)

      onResultsReceived(json.votes || [])

      // Effacer le mot de passe après utilisation pour plus de sécurité
      setPassword("")
    } catch (err: any) {
      console.error("Erreur lors de l'extraction:", err)
      setError(err.message || "Une erreur est survenue")
      onResultsReceived([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="bg-white rounded-xl shadow p-6 mb-6">
      <h2 className="text-xl font-semibold mb-4">Extraction des votes</h2>

      {!publicKeyLoaded && (
        <Alert className="mb-4 bg-yellow-50 border-yellow-200">
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertTitle>Chargement du système de sécurité...</AlertTitle>
          <AlertDescription>Veuillez patienter pendant que nous préparons le système de chiffrement.</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border border-gray-200 rounded-md bg-gray-50">
          <div className="md:col-span-2 flex items-center gap-2 mb-2 text-sm text-gray-600">
            <ShieldIcon className="h-4 w-4 text-green-600" />
            <span>Vos identifiants sont chiffrés avant d'être transmis au serveur</span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="username" className="flex items-center">
              Identifiant ISO
            </Label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Votre identifiant ISO"
              required
              disabled={!publicKeyLoaded || loading}
              autoComplete="username"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="flex items-center">
              Mot de passe ISO
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Votre mot de passe ISO"
              required
              disabled={!publicKeyLoaded || loading}
              autoComplete="current-password"
            />
          </div>
          <div className="md:col-span-2">
            <p className="text-xs text-gray-500 italic">
              Note: Vos identifiants sont chiffrés localement et ne sont jamais stockés.
            </p>
          </div>
        </div>

        <div>
          <Label htmlFor="commission">Commission</Label>
          <Select value={commissionId} onValueChange={setCommissionId} disabled={loading}>
            <SelectTrigger id="commission" className="w-full">
              <SelectValue placeholder="-- Sélectionner --" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gd3://prod/Committee/id=642234">Buildwise/E088/089</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=642369">Buildwise-SECO/E033</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=642112">Buildwise-SECO/E125</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=642050">Buildwise-SECO/E250/25001</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=642515">Buildwise-SECO/E25002</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=669049">Buildwise-SECO/E25003-04</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=642514">Buildwise-SECO/E25005</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=642511">Buildwise-SECO/E25006</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=642512">Buildwise-SECO/E25007</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=642530">Buildwise-SECO/E25008</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=642528">Buildwise-SECO/E25009</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=6161612">Buildwise-SECO/E25011</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=642046">Buildwise-SECO/E254</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=642288">Buildwise/E067</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=642133">Buildwise/E126</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=642135">Buildwise/E128</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=642106">Buildwise/E139</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=642356">Buildwise/E166</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=642073">Buildwise/E241</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=642070">Buildwise/E246</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=642097">Buildwise/E277</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=642065">Buildwise/E284</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=642307">Buildwise/E303</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=642290">Buildwise/E323</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=642293">Buildwise/E339</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=642376">Buildwise/E346</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=642375">Buildwise/E349</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=642403">Buildwise/E350</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=8530316">Buildwise/E35001</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=642406">Buildwise/E351</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=5773606">Buildwise/E442</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=8382042">Buildwise/E451</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=642233">Buildwise/I059</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=9626779">Buildwise/I05915</SelectItem>
              <SelectItem value="gd3://prod/Committee/id=642572">Buildwise/I05916</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="startDate">Date dernière réunion (closing date from)</Label>
          <Input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
            disabled={loading}
          />
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="extractDetails"
            checked={extractDetails}
            onCheckedChange={(checked) => setExtractDetails(checked === true)}
            disabled={loading}
          />
          <Label htmlFor="extractDetails" className="text-sm text-gray-700">
            Extraire les détails des votes (plus lent mais plus complet)
          </Label>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-between items-center pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              setDebugInfo("Réchauffement manuel de l'API Render...")
              const success = await warmupRenderApi()
              setDebugInfo((prev) => `${prev}\n\nRéchauffement manuel: ${success ? "Succès" : "Échec"}`)
            }}
            disabled={loading}
            className="text-sm"
          >
            Réchauffer l'API Render
          </Button>

          <Button type="submit" disabled={loading || !publicKeyLoaded} className="w-auto">
            {loading ? (
              <span className="flex items-center">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Extraction en cours...
              </span>
            ) : (
              <span className="flex items-center">
                {publicKeyLoaded ? (
                  <>
                    <ShieldIcon className="mr-2 h-4 w-4" />
                    Extraire les votes
                  </>
                ) : (
                  "Chargement du système de sécurité..."
                )}
              </span>
            )}
          </Button>
        </div>
      </form>

      <div className="mt-4 flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowDebug(!showDebug)}
          className="flex items-center gap-1"
        >
          <BugIcon className="h-4 w-4" />
          {showDebug ? "Masquer le débogage" : "Afficher le débogage"}
        </Button>
      </div>

      {showDebug && debugInfo && (
        <div className="mt-4 p-4 bg-gray-100 rounded-md overflow-auto max-h-96">
          <pre className="text-xs whitespace-pre-wrap">{debugInfo}</pre>
        </div>
      )}
    </Card>
  )
}
