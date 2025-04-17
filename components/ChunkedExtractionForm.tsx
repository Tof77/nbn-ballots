"use client"

import type React from "react"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Loader2, ShieldIcon, BugIcon } from "lucide-react"
import { encryptCredentials } from "@/utils/encryption"

interface ChunkedExtractionFormProps {
  onResultsReceived: (results: any[], isDemoMode?: boolean) => void
}

export default function ChunkedExtractionForm({ onResultsReceived }: ChunkedExtractionFormProps) {
  const [commissionId, setCommissionId] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [extractDetails, setExtractDetails] = useState(true)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [publicKeyLoaded, setPublicKeyLoaded] = useState(false)
  const [debugInfo, setDebugInfo] = useState<string | null>(null)
  const [showDebug, setShowDebug] = useState(false)
  const [demoMode, setDemoMode] = useState(false)

  // État pour l'extraction par lots
  const [chunkSize, setChunkSize] = useState(10)
  const [currentChunk, setCurrentChunk] = useState(0)
  const [totalChunks, setTotalChunks] = useState(1)
  const [progress, setProgress] = useState(0)
  const [allResults, setAllResults] = useState<any[]>([])

  // Vérifier que la clé publique est disponible au chargement du composant
  useState(() => {
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
  })

  // Fonction pour extraire un lot de votes
  const extractChunk = useCallback(
    async (chunkIndex: number, totalChunks: number) => {
      try {
        setDebugInfo((prev) => `${prev || ""}\n\nExtraction du lot ${chunkIndex + 1}/${totalChunks}...`)

        // Chiffrer les identifiants
        const { encryptedUsername, encryptedPassword } = await encryptCredentials(username, password)

        // Préparer les données de la requête
        const requestData = {
          commissionId,
          startDate,
          endDate: endDate || undefined,
          extractDetails,
          credentials: {
            encryptedUsername,
            encryptedPassword,
          },
          chunkSize,
          chunkIndex,
          totalChunks,
          forceDemoMode: demoMode,
        }

        // Appeler l'API d'extraction par lots
        const response = await fetch("/api/extract-votes-chunked", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
            Expires: "0",
          },
          body: JSON.stringify(requestData),
          signal: AbortSignal.timeout(90000), // 90 secondes de timeout
        })

        // Vérifier si la réponse est OK
        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Erreur lors de l'extraction du lot ${chunkIndex + 1}: ${errorText}`)
        }

        // Récupérer les données de la réponse
        const data = await response.json()

        // Mettre à jour les informations de débogage
        setDebugInfo(
          (prev) =>
            `${prev || ""}\n\nLot ${chunkIndex + 1}/${totalChunks} extrait avec succès: ${data.votes?.length || 0} votes`,
        )

        return data
      } catch (error: unknown) {
        setDebugInfo(
          (prev) =>
            `${prev || ""}\n\nErreur lors de l'extraction du lot ${chunkIndex + 1}/${totalChunks}: ${error instanceof Error ? error.message : String(error)}`,
        )
        throw error
      }
    },
    [commissionId, startDate, endDate, extractDetails, username, password, chunkSize, demoMode],
  )

  // Fonction pour extraire tous les lots
  const extractAllChunks = useCallback(async () => {
    try {
      setLoading(true)
      setError("")
      setDebugInfo("Démarrage de l'extraction par lots...")
      setProgress(0)
      setAllResults([])

      // Initialiser les variables
      const results: any[] = []
      let success = true

      // Extraire chaque lot
      for (let i = 0; i < totalChunks; i++) {
        try {
          setCurrentChunk(i)
          const data = await extractChunk(i, totalChunks)

          // Ajouter les votes au résultat global
          if (data.votes && Array.isArray(data.votes)) {
            results.push(...data.votes)
          }

          // Mettre à jour la progression
          setProgress(((i + 1) / totalChunks) * 100)
        } catch (error: unknown) {
          if (
            error &&
            typeof error === "object" &&
            "name" in error &&
            (error.name === "AbortError" || error.name === "TimeoutError")
          ) {
            setDebugInfo((prev) => `${prev || ""}\n\nL'opération a expiré (timeout). L'extraction prend trop de temps.`)
            setError(
              "L'opération a expiré. L'extraction des votes prend trop de temps. Essayez de réduire la plage de dates ou de désactiver l'extraction des détails des votes.",
            )

            // Activer automatiquement le mode démo en cas de timeout
            setDemoMode(true)
            onResultsReceived([], true)
          } else {
            // Autres erreurs
            setDebugInfo(
              (prev) =>
                `${prev || ""}\n\nErreur lors de l'extraction: ${error instanceof Error ? error.message : String(error)}`,
            )
            setError(error instanceof Error ? error.message : String(error) || "Une erreur est survenue")
            onResultsReceived([])
          }
          success = false
          break
        }
      }

      // Si au moins un lot a été extrait avec succès, retourner les résultats
      if (results.length > 0) {
        setAllResults(results)
        onResultsReceived(results, demoMode)
        setDebugInfo((prev) => `${prev || ""}\n\nExtraction terminée: ${results.length} votes extraits au total`)
      } else if (!success) {
        setError("L'extraction a échoué. Veuillez réessayer avec moins de lots ou activer le mode démo.")
        onResultsReceived([])
      } else {
        setDebugInfo((prev) => `${prev || ""}\n\nAucun vote trouvé`)
        onResultsReceived([])
      }
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : String(error))
      onResultsReceived([])
    } finally {
      setLoading(false)
    }
  }, [totalChunks, extractChunk, onResultsReceived, demoMode])

  // Fonction pour gérer la soumission du formulaire
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await extractAllChunks()
  }

  return (
    <Card className="bg-white rounded-xl shadow p-6 mb-6">
      <h2 className="text-xl font-semibold mb-4">Extraction des votes (mode optimisé)</h2>

      {!publicKeyLoaded && (
        <Alert className="mb-4 bg-yellow-50 border-yellow-200">
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertTitle>Chargement du système de sécurité...</AlertTitle>
          <AlertDescription>Veuillez patienter pendant que nous préparons le système de chiffrement.</AlertDescription>
        </Alert>
      )}

      {demoMode && (
        <Alert className="mb-4 bg-blue-50 border-blue-200 text-blue-800">
          <AlertTitle className="flex items-center gap-2">
            <BugIcon className="h-4 w-4" />
            Mode Démonstration
          </AlertTitle>
          <AlertDescription>
            L'application fonctionne actuellement en mode démonstration avec des données simulées. Les données affichées
            ne proviennent pas d'isolutions.iso.org.
          </AlertDescription>
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          <div>
            <Label htmlFor="endDate">Date fin (optionnel)</Label>
            <Input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={loading}
            />
          </div>
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

        <div className="flex items-center space-x-2">
          <Checkbox
            id="forceDemoMode"
            checked={demoMode}
            onCheckedChange={(checked) => setDemoMode(checked === true)}
            disabled={loading}
          />
          <Label htmlFor="forceDemoMode" className="text-sm text-gray-700">
            Utiliser le mode démo (données simulées)
          </Label>
        </div>

        <div className="p-4 border border-gray-200 rounded-md bg-gray-50">
          <h3 className="text-sm font-medium mb-2">Paramètres d'extraction par lots</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="chunkSize" className="text-xs">
                Taille des lots
              </Label>
              <Select
                value={chunkSize.toString()}
                onValueChange={(value) => setChunkSize(Number.parseInt(value))}
                disabled={loading}
              >
                <SelectTrigger id="chunkSize" className="w-full">
                  <SelectValue placeholder="10" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 votes par lot</SelectItem>
                  <SelectItem value="10">10 votes par lot</SelectItem>
                  <SelectItem value="20">20 votes par lot</SelectItem>
                  <SelectItem value="50">50 votes par lot</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="totalChunks" className="text-xs">
                Nombre de lots
              </Label>
              <Select
                value={totalChunks.toString()}
                onValueChange={(value) => setTotalChunks(Number.parseInt(value))}
                disabled={loading}
              >
                <SelectTrigger id="totalChunks" className="w-full">
                  <SelectValue placeholder="1" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 lot</SelectItem>
                  <SelectItem value="2">2 lots</SelectItem>
                  <SelectItem value="3">3 lots</SelectItem>
                  <SelectItem value="4">4 lots</SelectItem>
                  <SelectItem value="5">5 lots</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            L'extraction par lots permet d'éviter les timeouts en divisant le travail en plusieurs requêtes plus
            petites.
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progression: {Math.round(progress)}%</span>
              <span>
                Lot {currentChunk + 1}/{totalChunks}
              </span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        <div className="flex justify-between items-center pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setDemoMode(true)}
            disabled={loading}
            className="text-sm"
          >
            Mode démo
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
