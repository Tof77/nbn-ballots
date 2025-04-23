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
import { Loader2, ShieldIcon, BugIcon, ArrowDownIcon } from "lucide-react"
import { encryptCredentials } from "@/utils/encryption"

interface StreamingExtractionFormProps {
  onVoteReceived: (vote: any) => void
  onExtractionComplete: (isDemoMode: boolean) => void
  onExtractionStart: () => void
  onError: (error: string) => void
}

export default function StreamingExtractionForm({
  onVoteReceived,
  onExtractionComplete,
  onExtractionStart,
  onError,
}: StreamingExtractionFormProps) {
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
  const [extractionId, setExtractionId] = useState<string | null>(null)
  const [votesReceived, setVotesReceived] = useState(0)
  const [progress, setProgress] = useState(0)

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

  // Effet pour le polling des résultats
  useEffect(() => {
    if (!extractionId || !loading) return

    const pollInterval = setInterval(async () => {
      try {
        // Ajouter le token à la requête
        const response = await fetch(`/api/extraction-stream?id=${extractionId}`, {
          headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        })

        if (!response.ok) {
          clearInterval(pollInterval)
          setError(`Erreur lors de la récupération des résultats: ${response.status}`)
          onError(`Erreur lors de la récupération des résultats: ${response.status}`)
          setLoading(false)
          return
        }

        const data = await response.json()

        // Si nous avons de nouveaux votes
        if (data.votes && data.votes.length > votesReceived) {
          // Traiter uniquement les nouveaux votes
          const newVotes = data.votes.slice(votesReceived)
          setVotesReceived(data.votes.length)

          // Envoyer chaque nouveau vote au composant parent
          newVotes.forEach((vote: any) => {
            onVoteReceived(vote)
          })

          setDebugInfo((prev) => `${prev || ""}\nReçu ${newVotes.length} nouveaux votes (total: ${data.votes.length})`)
        }

        // Mettre à jour la progression si disponible
        if (data.progress !== undefined) {
          setProgress(data.progress)
        }

        // Si l'extraction est terminée
        if (data.status === "completed" || data.status === "failed") {
          clearInterval(pollInterval)
          setLoading(false)

          if (data.status === "completed") {
            setDebugInfo((prev) => `${prev || ""}\nExtraction terminée avec succès (${data.votes?.length || 0} votes)`)
            onExtractionComplete(data.demoMode || false)
          } else {
            setError(data.message || "L'extraction a échoué")
            onError(data.message || "L'extraction a échoué")
          }
        }
      } catch (error) {
        setDebugInfo((prev) => `${prev || ""}\nErreur lors du polling: ${error}`)
      }
    }, 2000) // Vérifier toutes les 2 secondes

    return () => clearInterval(pollInterval)
  }, [extractionId, loading, votesReceived, onVoteReceived, onExtractionComplete, onError])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setDebugInfo("Démarrage de l'extraction...")
    setVotesReceived(0)
    setExtractionId(null)
    onExtractionStart()

    try {
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
        streamResults: true,
        forceDemoMode: demoMode,
      }

      // Appeler l'API pour démarrer l'extraction
      const response = await fetch("/api/extraction-start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Erreur lors du démarrage de l'extraction: ${errorText}`)
      }

      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      // Stocker l'ID d'extraction pour le polling
      if (data.extractionId) {
        setExtractionId(data.extractionId)
        setDebugInfo((prev) => `${prev || ""}\nID d'extraction: ${data.extractionId}`)
      } else {
        throw new Error("Aucun ID d'extraction reçu")
      }

      // Si nous avons déjà des votes dans la réponse initiale
      if (data.votes && data.votes.length > 0) {
        setVotesReceived(data.votes.length)
        data.votes.forEach((vote: any) => {
          onVoteReceived(vote)
        })
        setDebugInfo((prev) => `${prev || ""}\nReçu ${data.votes.length} votes initiaux`)
      }

      // Si l'extraction est déjà terminée
      if (data.status === "completed") {
        setLoading(false)
        setDebugInfo((prev) => `${prev || ""}\nExtraction terminée immédiatement (${data.votes?.length || 0} votes)`)
        onExtractionComplete(data.demoMode || false)
      }
    } catch (error: any) {
      setError(error.message || "Une erreur est survenue")
      onError(error.message || "Une erreur est survenue")
      setLoading(false)
      setDebugInfo((prev) => `${prev || ""}\nErreur: ${error.message}`)
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

      {demoMode && (
        <Alert className="mb-4 bg-blue-50 border-blue-200 text-blue-800">
          <AlertTitle className="flex items-center gap-2">
            <BugIcon className="h-4 w-4" />
            Mode Démonstration
          </AlertTitle>
          <AlertDescription>
            L'application fonctionnera en mode démonstration avec des données simulées. Les données affichées ne
            proviendront pas d'isolutions.iso.org.
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

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
            <div className="flex items-center">
              <Loader2 className="h-5 w-5 text-blue-600 animate-spin mr-2" />
              <div>
                <h3 className="font-medium text-blue-800">Extraction en cours...</h3>
                <p className="text-sm text-blue-600">
                  {votesReceived > 0
                    ? `${votesReceived} votes extraits jusqu'à présent`
                    : "En attente des premiers résultats..."}
                </p>
              </div>
            </div>
            <div className="mt-2">
              <div className="w-full bg-blue-200 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-xs text-right mt-1 text-blue-600">{progress}%</p>
            </div>
            <div className="mt-2 text-xs text-blue-600">
              Les résultats s'affichent au fur et à mesure de l'extraction
              <ArrowDownIcon className="inline-block ml-1 h-3 w-3" />
            </div>
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
