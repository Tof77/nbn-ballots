"use client"

import type React from "react"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Loader2,
  ShieldIcon,
  WifiIcon,
  WifiOffIcon,
  ClockIcon,
  AlertTriangleIcon,
  RefreshCwIcon,
  InfoIcon,
} from "lucide-react"
import { encryptCredentials } from "@/utils/encryption"

// Interface pour les informations de l'API Render
interface RenderApiStatus {
  status: "unknown" | "active" | "inactive" | "error" | "starting" | "maintenance"
  message: string
  lastChecked: Date | null
  statusCode?: number
}

// Interface pour le résultat du réchauffement de l'API Render
interface WarmupResult {
  success: boolean
  status: string
  statusMessage?: string
  message: string
  statusCode?: number
  errorDetails?: string
  responseText?: string
}

// Interface pour les props du composant
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
  const [extractDetails, setExtractDetails] = useState(true)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [publicKeyLoaded, setPublicKeyLoaded] = useState(false)
  const [debugInfo, setDebugInfo] = useState<string | null>(null)
  const [showDebug, setShowDebug] = useState(false)
  const [renderApiStatus, setRenderApiStatus] = useState<RenderApiStatus>({
    status: "unknown",
    message: "Statut de l'API Render inconnu",
    lastChecked: null,
    statusCode: 0,
  })
  const [isWarmingUp, setIsWarmingUp] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [autoRetry, setAutoRetry] = useState(false)
  const [progress, setProgress] = useState(0)
  const [extractionId, setExtractionId] = useState<string | null>(null)
  const [votesCount, setVotesCount] = useState(0)
  const eventSourceRef = useRef<EventSource | null>(null)

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
      } catch (err: unknown) {
        setError("Erreur lors de la vérification de la clé publique")
      }
    }

    checkPublicKey()
  }, [])

  // Vérifier l'état de l'API Render au chargement
  useEffect(() => {
    checkRenderApiStatus()
  }, [])

  // Effet pour la tentative automatique de reconnexion
  useEffect(() => {
    let retryTimer: NodeJS.Timeout | null = null

    if (
      autoRetry &&
      (renderApiStatus.status === "error" ||
        renderApiStatus.status === "maintenance" ||
        renderApiStatus.status === "starting")
    ) {
      retryTimer = setTimeout(() => {
        setRetryCount((prev) => prev + 1)
        checkRenderApiStatus()
      }, 10000) // Réessayer toutes les 10 secondes
    }

    return () => {
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [autoRetry, renderApiStatus.status, retryCount])

  // Nettoyer l'EventSource lors du démontage du composant
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [])

  // Fonction pour vérifier l'état de l'API Render
  const checkRenderApiStatus = useCallback(async () => {
    setIsWarmingUp(true)
    try {
      // Ajouter un paramètre de cache-buster pour éviter les réponses en cache
      const timestamp = new Date().getTime()
      const response = await fetch(`/api/warmup-render?cache=${timestamp}`, {
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      })

      // Lire le texte de la réponse
      let responseText = ""
      try {
        responseText = await response.text()
      } catch (textError) {
        console.error("Erreur lors de la lecture de la réponse:", textError)
        throw new Error(
          `Erreur lors de la lecture de la réponse: ${textError instanceof Error ? textError.message : String(textError)}`,
        )
      }

      // Essayer de parser le JSON
      let data
      try {
        data = JSON.parse(responseText)
      } catch (jsonError: unknown) {
        console.error("Erreur lors du parsing de la réponse JSON:", jsonError)
        console.log("Réponse brute:", responseText.substring(0, 200))
        throw new Error(
          `La réponse n'est pas un JSON valide: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`,
        )
      }

      // Ajouter plus de détails sur l'erreur
      let errorDetails = ""
      if (data.status === "error" || !data.success) {
        errorDetails = data.errorDetails || data.message || "Erreur inconnue"
      }

      // Vérifier si le service est en maintenance (503)
      const isMaintenanceMode = response.status === 503

      setRenderApiStatus({
        status: data.success
          ? "active"
          : isMaintenanceMode
            ? "maintenance"
            : data.statusMessage === "starting"
              ? "starting"
              : data.status === "error"
                ? "error"
                : "inactive",
        message: data.message + (errorDetails ? ` (Détails: ${errorDetails})` : ""),
        lastChecked: new Date(),
        statusCode: response.status,
      })
    } catch (error: unknown) {
      setRenderApiStatus({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        lastChecked: new Date(),
        statusCode: 0,
      })
    } finally {
      setIsWarmingUp(false)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setDebugInfo(null)
    setProgress(0)
    setVotesCount(0)
    setExtractionId(null)

    // Fermer l'EventSource existant s'il y en a un
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    // Notifier le parent que l'extraction a commencé
    onExtractionStart()

    try {
      // Réchauffer l'API Render avant de l'utiliser
      setDebugInfo("Réchauffement de l'API Render...")
      await checkRenderApiStatus()

      // Si l'API Render n'est pas active, afficher une erreur
      if (renderApiStatus.status !== "active") {
        setError(`L'API Render n'est pas disponible (${renderApiStatus.status}). Veuillez réessayer plus tard.`)
        setLoading(false)
        onError(`L'API Render n'est pas disponible (${renderApiStatus.status})`)
        return
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
      setDebugInfo((prev) => `${prev || ""}\n\nDonnées envoyées à l'API: ${JSON.stringify(debugRequestData, null, 2)}`)

      // Démarrer l'extraction
      const response = await fetch("/api/extraction-start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
        body: JSON.stringify(requestData),
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = `Erreur lors du démarrage de l'extraction (${response.status})`

        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.error || errorData.message || errorMessage
        } catch (e) {
          // Si le parsing échoue, utiliser le texte brut
          errorMessage = errorText || errorMessage
        }

        setError(errorMessage)
        setLoading(false)
        onError(errorMessage)
        return
      }

      const data = await response.json()
      console.log("Réponse de l'API extraction-start:", data)
      setDebugInfo((prev) => `${prev || ""}\n\nRéponse de l'API extraction-start: ${JSON.stringify(data, null, 2)}`)

      if (!data.extractionId) {
        setError("Aucun ID d'extraction reçu")
        setLoading(false)
        onError("Aucun ID d'extraction reçu")
        return
      }

      setExtractionId(data.extractionId)

      // Configurer l'EventSource pour recevoir les mises à jour en temps réel
      const eventSource = new EventSource(`/api/extraction-stream?id=${data.extractionId}`)
      eventSourceRef.current = eventSource

      eventSource.onopen = () => {
        console.log("Connexion SSE établie")
        setDebugInfo((prev) => `${prev || ""}\n\nConnexion SSE établie`)
      }

      eventSource.onmessage = (event) => {
        try {
          const eventData = JSON.parse(event.data)
          console.log("Mise à jour SSE reçue:", eventData)
          setDebugInfo((prev) => `${prev || ""}\n\nMise à jour SSE reçue: ${JSON.stringify(eventData, null, 2)}`)

          // Mettre à jour la progression
          if (eventData.progress !== undefined) {
            setProgress(eventData.progress)
          }

          // Traiter les votes reçus
          if (eventData.vote) {
            onVoteReceived(eventData.vote)
            setVotesCount((prev) => prev + 1)
          }

          // Vérifier si l'extraction est terminée
          if (eventData.status === "completed" || eventData.status === "failed") {
            if (eventData.status === "completed") {
              onExtractionComplete(false)
            } else {
              setError(eventData.message || "L'extraction a échoué")
              onError(eventData.message || "L'extraction a échoué")
            }

            setLoading(false)
            eventSource.close()
            eventSourceRef.current = null
          }
        } catch (error) {
          console.error("Erreur lors du traitement des données SSE:", error)
          setDebugInfo((prev) => `${prev || ""}\n\nErreur lors du traitement des données SSE: ${error}`)
        }
      }

      eventSource.onerror = (error) => {
        console.error("Erreur SSE:", error)
        setDebugInfo((prev) => `${prev || ""}\n\nErreur SSE: ${JSON.stringify(error)}`)

        // Fermer la connexion en cas d'erreur
        eventSource.close()
        eventSourceRef.current = null

        // Afficher l'erreur seulement si nous sommes toujours en chargement
        if (loading) {
          setError("Erreur lors de la réception des mises à jour en temps réel")
          setLoading(false)
          onError("Erreur lors de la réception des mises à jour en temps réel")
        }
      }
    } catch (error: any) {
      console.error("Erreur lors de l'extraction:", error)
      setError(error.message || "Une erreur est survenue")
      setLoading(false)
      onError(error.message || "Une erreur est survenue")
    }
  }

  // Fonction pour afficher l'indicateur de statut de l'API Render
  const renderApiStatusIndicator = () => {
    const getIcon = () => {
      switch (renderApiStatus.status) {
        case "active":
          return <WifiIcon className="h-4 w-4 text-green-500" />
        case "starting":
          return <ClockIcon className="h-4 w-4 text-blue-500" />
        case "maintenance":
          return <AlertTriangleIcon className="h-4 w-4 text-yellow-500" />
        case "inactive":
          return <WifiOffIcon className="h-4 w-4 text-orange-500" />
        case "error":
          return <WifiOffIcon className="h-4 w-4 text-red-500" />
        default:
          return <WifiOffIcon className="h-4 w-4 text-gray-400" />
      }
    }

    const getStatusText = () => {
      switch (renderApiStatus.status) {
        case "active":
          return "API Render active"
        case "starting":
          return "API Render en cours de démarrage"
        case "maintenance":
          return "API Render en maintenance"
        case "inactive":
          return "API Render inactive"
        case "error":
          return "Erreur de connexion à l'API Render"
        default:
          return "Statut de l'API Render inconnu"
      }
    }

    const getStatusClass = () => {
      switch (renderApiStatus.status) {
        case "active":
          return "bg-green-50 border-green-200 text-green-700"
        case "starting":
          return "bg-blue-50 border-blue-200 text-blue-700"
        case "maintenance":
          return "bg-yellow-50 border-yellow-200 text-yellow-700"
        case "inactive":
          return "bg-orange-50 border-orange-200 text-orange-700"
        case "error":
          return "bg-red-50 border-red-200 text-red-700"
        default:
          return "bg-gray-50 border-gray-200 text-gray-700"
      }
    }

    return (
      <div className={`flex flex-col gap-2 p-2 rounded-md border ${getStatusClass()} text-sm mb-4`}>
        <div className="flex items-center gap-2">
          {isWarmingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : getIcon()}
          <div className="flex-1">
            <p className="font-medium">{getStatusText()}</p>
            <p className="text-xs">{renderApiStatus.message}</p>
            {renderApiStatus.statusCode && <p className="text-xs">Code de statut: {renderApiStatus.statusCode}</p>}
            {renderApiStatus.lastChecked && (
              <p className="text-xs opacity-75">
                Dernière vérification: {renderApiStatus.lastChecked.toLocaleTimeString()}
              </p>
            )}
            {retryCount > 0 && autoRetry && (
              <p className="text-xs mt-1">
                <RefreshCwIcon className="h-3 w-3 inline mr-1 animate-spin" />
                Tentatives de reconnexion: {retryCount}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={checkRenderApiStatus}
              disabled={isWarmingUp}
              className="text-xs"
            >
              {isWarmingUp ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Vérification...
                </span>
              ) : (
                "Vérifier"
              )}
            </Button>
            {(renderApiStatus.status === "error" ||
              renderApiStatus.status === "maintenance" ||
              renderApiStatus.status === "starting") && (
              <Button
                variant={autoRetry ? "default" : "outline"}
                size="sm"
                onClick={() => setAutoRetry(!autoRetry)}
                className="text-xs"
              >
                {autoRetry ? "Arrêter" : "Auto-retry"}
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <Card className="bg-white rounded-xl shadow p-6 mb-6">
      <h2 className="text-xl font-semibold mb-4">Extraction des votes (mode streaming)</h2>

      {!publicKeyLoaded && (
        <Alert className="mb-4 bg-yellow-50 border-yellow-200">
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertTitle>Chargement du système de sécurité...</AlertTitle>
          <AlertDescription>Veuillez patienter pendant que nous préparons le système de chiffrement.</AlertDescription>
        </Alert>
      )}

      {/* Afficher l'indicateur de statut de l'API Render */}
      {renderApiStatusIndicator()}

      {loading && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Progression de l'extraction</span>
            <span className="text-sm">{progress}%</span>
          </div>
          <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${progress}%` }}></div>
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-500">
            <span>Votes extraits: {votesCount}</span>
            <span>ID d'extraction: {extractionId || "N/A"}</span>
          </div>
        </div>
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
            onClick={checkRenderApiStatus}
            disabled={loading || isWarmingUp}
            className="text-sm"
          >
            {isWarmingUp ? (
              <span className="flex items-center gap-1">
                <Loader2 className="h-4 w-4 animate-spin" />
                Vérification...
              </span>
            ) : (
              "Vérifier l'API Render"
            )}
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
          <InfoIcon className="h-4 w-4" />
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
