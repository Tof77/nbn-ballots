"use client"

import type React from "react"

import { useState, useEffect, useCallback } from "react"
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
  BugIcon,
  WifiIcon,
  WifiOffIcon,
  ClockIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  AlertTriangleIcon,
  RefreshCwIcon,
} from "lucide-react"
import { encryptCredentials } from "@/utils/encryption"

// Interface pour la réponse de l'API
interface ApiResponse {
  votes?: any[]
  debug?: any
  error?: string
  details?: string
  diagnostics?: string[]
  renderApiStatus?: string
  renderApiMessage?: string
}

// Interface pour le résultat du réchauffement de l'API
interface WarmupResult {
  success: boolean
  status: string
  statusMessage?: string
  message: string
  statusCode?: number
  errorDetails?: string
  responseText?: string
}

// Ajouter une nouvelle fonction pour réchauffer l'API Render avant l'extraction
async function warmupRenderApi(queryParams = ""): Promise<WarmupResult> {
  try {
    console.log("Réchauffement de l'API Render...")
    const response = await fetch(`/api/warmup-render${queryParams}`, {
      // Ajouter un cache-buster pour éviter les réponses en cache
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
      // Ajouter un timestamp pour éviter le cache
      cache: "no-store",
    })

    // Lire le texte de la réponse
    let responseText = ""
    try {
      responseText = await response.text()
    } catch (textError) {
      console.error("Erreur lors de la lecture de la réponse:", textError)
      return {
        success: false,
        status: "error",
        message: `Erreur lors de la lecture de la réponse: ${textError instanceof Error ? textError.message : String(textError)}`,
        statusCode: 0,
      }
    }

    // Essayer de parser le JSON
    let data
    try {
      data = JSON.parse(responseText)
    } catch (jsonError: unknown) {
      console.error("Erreur lors du parsing de la réponse JSON:", jsonError)
      console.log("Réponse brute:", responseText.substring(0, 200))
      return {
        success: false,
        status: "error",
        message: `La réponse n'est pas un JSON valide: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`,
        statusCode: response.status,
        responseText: responseText.substring(0, 500),
      }
    }

    console.log("Résultat du réchauffement:", data)

    // Si l'API est en cours de démarrage, considérer comme un succès partiel
    if (data.statusMessage === "starting") {
      return {
        success: false,
        status: "starting",
        statusMessage: "starting",
        message: data.message || "L'API Render est en cours de démarrage, veuillez réessayer dans 30-60 secondes",
        statusCode: data.status || response.status,
      }
    }

    return {
      success: data.success === true,
      status: data.statusMessage || (data.success ? "active" : "inactive"),
      statusMessage: data.statusMessage,
      message: data.message || "Statut de l'API inconnu",
      statusCode: data.status || response.status,
      errorDetails: data.error || data.details || null,
    }
  } catch (error: unknown) {
    console.error("Erreur lors du réchauffement:", error)
    return {
      success: false,
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      statusCode: 0,
    }
  }
}

// Fonction pour vérifier si le service Render est en maintenance (erreur 503)
function isServiceUnavailable(statusCode: number): boolean {
  return statusCode === 503
}

// Fonction pour obtenir des informations sur l'erreur HTTP
function getHttpErrorInfo(statusCode: number): { title: string; description: string; suggestions: string[] } {
  switch (statusCode) {
    case 502:
      return {
        title: "Erreur 502 Bad Gateway",
        description: "Le serveur Render est probablement en cours de démarrage ou surchargé.",
        suggestions: [
          "Attendre quelques minutes et réessayer",
          "Vérifier le statut du service Render dans votre tableau de bord",
          "Redémarrer manuellement le service Render",
        ],
      }
    case 503:
      return {
        title: "Erreur 503 Service Unavailable",
        description: "Le service Render est temporairement indisponible ou en maintenance.",
        suggestions: [
          "Attendre que la maintenance soit terminée (généralement quelques minutes)",
          "Vérifier les annonces de maintenance sur le tableau de bord Render",
          "Vérifier si votre compte Render est actif et à jour",
          "Vérifier si vous avez atteint les limites de votre plan Render",
        ],
      }
    case 504:
      return {
        title: "Erreur 504 Gateway Timeout",
        description: "Le serveur Render a mis trop de temps à répondre.",
        suggestions: [
          "Réessayer l'opération",
          "Vérifier si le service Render est surchargé",
          "Optimiser les performances de votre application",
        ],
      }
    default:
      return {
        title: `Erreur ${statusCode}`,
        description: "Une erreur s'est produite lors de la communication avec l'API Render.",
        suggestions: [
          "Vérifier la configuration de l'API",
          "Consulter les logs du service",
          "Contacter l'administrateur système",
        ],
      }
  }
}

interface VoteExtractionFormProps {
  onResultsReceived: (results: any[], isDemoMode?: boolean) => void
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
  const [renderApiStatus, setRenderApiStatus] = useState<{
    status: "unknown" | "active" | "inactive" | "error" | "starting" | "maintenance"
    message: string
    lastChecked: Date | null
    statusCode?: number
  }>({
    status: "unknown",
    message: "Statut de l'API Render inconnu",
    lastChecked: null,
    statusCode: 0,
  })
  const [isWarmingUp, setIsWarmingUp] = useState(false)
  const [demoMode, setDemoMode] = useState(false)
  const [showErrorDetails, setShowErrorDetails] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [autoRetry, setAutoRetry] = useState(false)

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

  // Fonction pour vérifier l'état de l'API Render
  const checkRenderApiStatus = useCallback(async () => {
    setIsWarmingUp(true)
    try {
      // Ajouter un paramètre de cache-buster pour éviter les réponses en cache
      const timestamp = new Date().getTime()
      const result = await warmupRenderApi(`?cache=${timestamp}`)

      // Ajouter plus de détails sur l'erreur
      let errorDetails = ""
      if (result.status === "error" || !result.success) {
        errorDetails = result.errorDetails || result.message || "Erreur inconnue"
      }

      // Vérifier si le service est en maintenance (503)
      const isMaintenanceMode = isServiceUnavailable(result.statusCode || 0)

      setRenderApiStatus({
        status: result.success
          ? "active"
          : isMaintenanceMode
            ? "maintenance"
            : result.statusMessage === "starting"
              ? "starting"
              : result.status === "error"
                ? "error"
                : "inactive",
        message: result.message + (errorDetails ? ` (Détails: ${errorDetails})` : ""),
        lastChecked: new Date(),
        statusCode: result.statusCode || 0,
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
    setDemoMode(false)

    try {
      // Réchauffer l'API Render avant de l'utiliser
      setDebugInfo("Réchauffement de l'API Render...")
      const warmupResult = await warmupRenderApi()

      // Vérifier si le service est en maintenance (503)
      const isMaintenanceMode = isServiceUnavailable(warmupResult.statusCode || 0)

      setRenderApiStatus({
        status: warmupResult.success
          ? "active"
          : isMaintenanceMode
            ? "maintenance"
            : warmupResult.statusMessage === "starting"
              ? "starting"
              : warmupResult.status === "error"
                ? "error"
                : "inactive",
        message: warmupResult.message,
        lastChecked: new Date(),
        statusCode: warmupResult.statusCode || 0,
      })

      setDebugInfo(
        (prev) =>
          `${prev}\n\nRéchauffement de l'API Render: ${warmupResult.success ? "Succès" : "Échec"} - ${warmupResult.message}`,
      )

      // Si le service est en maintenance, proposer d'utiliser le mode démo
      if (isMaintenanceMode) {
        setDebugInfo((prev) => `${prev}\n\nService Render en maintenance (503). Utilisation du mode démo recommandée.`)
        setDemoMode(true)
      }

      // Attendre un peu après le réchauffement
      if (warmupResult.success) {
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
        // Ajouter un indicateur de mode démo si le service est en maintenance
        forceDemoMode: isMaintenanceMode,
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
      } catch (testError: unknown) {
        console.error("Erreur lors du test de l'API:", testError)
        setDebugInfo((prev) => `${prev}\n\nErreur lors du test de l'API: ${testError}`)
      }

      // Ajouter un gestionnaire de timeout plus robuste
      try {
        const res = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
            Expires: "0",
          },
          body: JSON.stringify(requestData),
          // Ajouter un timeout côté client
          signal: AbortSignal.timeout(120000), // 2 minutes de timeout
        })

        // Ajouter des logs pour le débogage
        console.log("Statut de la réponse:", res.status, res.statusText)
        setDebugInfo((prev) => `${prev}\n\nStatut de la réponse: ${res.status} ${res.statusText}`)

        const responseText = await res.text()
        console.log("Réponse brute de l'API:", responseText)
        setDebugInfo((prev) => `${prev}\n\nRéponse brute de l'API: ${responseText}`)

        // Utiliser l'interface ApiResponse pour typer la réponse JSON
        let json: ApiResponse

        try {
          json = JSON.parse(responseText)
          console.log("Réponse JSON parsée:", json)
          setDebugInfo((prev) => `${prev}\n\nRéponse JSON parsée: ${JSON.stringify(json, null, 2)}`)

          // Mettre à jour le statut de l'API Render si disponible
          if (json.renderApiStatus) {
            setRenderApiStatus({
              status: json.renderApiStatus === "available" ? "active" : "inactive",
              message: json.renderApiMessage || `API Render ${json.renderApiStatus}`,
              lastChecked: new Date(),
            })
          }

          if (json.debug?.demoMode) {
            setDemoMode(true)
            console.log("Mode démonstration activé")
            setDebugInfo((prev) => `${prev}\n\nMode démonstration activé - Utilisation de données simulées`)
          }
        } catch (parseError: unknown) {
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

        // Dans le bloc try après avoir reçu la réponse
        const isDemoMode = !!json.debug?.demoMode
        onResultsReceived(json.votes || [], isDemoMode)

        // Effacer le mot de passe après utilisation pour plus de sécurité
        setPassword("")
      } catch (error: unknown) {
        // Vérifier si c'est une erreur de timeout
        if (
          error &&
          typeof error === "object" &&
          "name" in error &&
          (error.name === "AbortError" || error.name === "TimeoutError")
        ) {
          setDebugInfo((prev) => `${prev}\n\nL'opération a expiré (timeout). L'extraction prend trop de temps.`)
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
              `${prev}\n\nErreur lors de l'extraction: ${error instanceof Error ? error.message : String(error)}`,
          )
          setError(error instanceof Error ? error.message : String(error) || "Une erreur est survenue")
          onResultsReceived([])
        }

        setLoading(false)
      }
    } catch (err: any) {
      console.error("Erreur lors de l'extraction:", err)
      setError(err.message || "Une erreur est survenue")
      onResultsReceived([])
    } finally {
      setLoading(false)
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

    // Obtenir les informations sur l'erreur HTTP si applicable
    const errorInfo =
      renderApiStatus.statusCode && renderApiStatus.statusCode >= 400
        ? getHttpErrorInfo(renderApiStatus.statusCode)
        : null

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

        {/* Ajouter un bouton pour afficher les détails de l'erreur si le statut est une erreur HTTP */}
        {errorInfo && (
          <div className="mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowErrorDetails(!showErrorDetails)}
              className="text-xs w-full flex items-center justify-center"
            >
              {showErrorDetails
                ? "Masquer les détails"
                : `Afficher les détails de l'erreur ${renderApiStatus.statusCode}`}
              {showErrorDetails ? (
                <ChevronUpIcon className="h-3 w-3 ml-1" />
              ) : (
                <ChevronDownIcon className="h-3 w-3 ml-1" />
              )}
            </Button>

            {showErrorDetails && (
              <div className="mt-2 p-2 bg-red-50 rounded-md text-xs">
                <p className="font-medium mb-1">{errorInfo.title}</p>
                <p>{errorInfo.description}</p>
                <p className="mt-1">Solutions possibles:</p>
                <ul className="list-disc pl-4 mt-1">
                  {errorInfo.suggestions.map((suggestion, index) => (
                    <li key={index}>{suggestion}</li>
                  ))}
                </ul>
                {renderApiStatus.statusCode === 503 && (
                  <div className="mt-2 p-2 bg-yellow-50 rounded border border-yellow-200">
                    <p className="font-medium">Note sur l'erreur 503:</p>
                    <p>
                      Cette erreur indique que le service Render est temporairement indisponible. Cela peut être dû à
                      une maintenance planifiée, une surcharge du service, ou des limitations de votre plan Render. Vous
                      pouvez continuer en mode démo pendant ce temps.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
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

      {/* Afficher l'indicateur de statut de l'API Render */}
      {renderApiStatusIndicator()}

      {renderApiStatus.status === "starting" && (
        <Alert className="mb-4 bg-blue-50 border-blue-200 text-blue-800">
          <AlertTitle className="flex items-center gap-2">
            <ClockIcon className="h-4 w-4" />
            API Render en cours de démarrage
          </AlertTitle>
          <AlertDescription>
            L'API Render est en train de démarrer. Ce processus peut prendre 30 à 60 secondes. Veuillez patienter ou
            réessayer dans quelques instants.
          </AlertDescription>
        </Alert>
      )}

      {renderApiStatus.status === "maintenance" && (
        <Alert className="mb-4 bg-yellow-50 border-yellow-200 text-yellow-800">
          <AlertTitle className="flex items-center gap-2">
            <AlertTriangleIcon className="h-4 w-4" />
            API Render en maintenance
          </AlertTitle>
          <AlertDescription>
            <p>
              L'API Render est actuellement en maintenance ou temporairement indisponible (erreur 503). Vous pouvez
              continuer en mode démo ou réessayer plus tard.
            </p>
            <div className="mt-2">
              <Button variant="outline" size="sm" onClick={() => setDemoMode(true)} className="mr-2">
                Utiliser le mode démo
              </Button>
              <Button variant="outline" size="sm" onClick={checkRenderApiStatus}>
                Vérifier à nouveau
              </Button>
            </div>
          </AlertDescription>
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

      {renderApiStatus.status === "inactive" && (
        <Alert className="mb-4 bg-orange-50 border-orange-200 text-orange-800">
          <AlertTitle className="flex items-center gap-2">
            <WifiOffIcon className="h-4 w-4" />
            Note importante concernant l'API Render
          </AlertTitle>
          <AlertDescription>
            Si l'API Render ne répond pas, il est possible qu'une fenêtre de confirmation GDPR soit affichée sur le
            serveur. Dans ce cas, un administrateur doit se connecter au serveur Render pour accepter les conditions.
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

        <div className="flex justify-between items-center pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              setIsWarmingUp(true)
              setDebugInfo("Réchauffement manuel de l'API Render...")
              try {
                const result = await warmupRenderApi()

                // Vérifier si le service est en maintenance (503)
                const isMaintenanceMode = isServiceUnavailable(result.statusCode || 0)

                setRenderApiStatus({
                  status: result.success
                    ? "active"
                    : isMaintenanceMode
                      ? "maintenance"
                      : result.statusMessage === "starting"
                        ? "starting"
                        : result.status === "error"
                          ? "error"
                          : "inactive",
                  message: result.message,
                  lastChecked: new Date(),
                  statusCode: result.statusCode || 0,
                })

                setDebugInfo(
                  (prev) =>
                    `${prev}\n\nRéchauffement manuel: ${result.success ? "Succès" : "Échec"} - ${result.message}`,
                )
              } catch (error: unknown) {
                setDebugInfo(
                  (prev) =>
                    `${prev}\n\nErreur lors du réchauffement: ${error instanceof Error ? error.message : String(error)}`,
                )
              } finally {
                setIsWarmingUp(false)
              }
            }}
            disabled={loading || isWarmingUp}
            className="text-sm"
          >
            {isWarmingUp ? (
              <span className="flex items-center gap-1">
                <Loader2 className="h-4 w-4 animate-spin" />
                Réchauffement...
              </span>
            ) : (
              "Réchauffer l'API Render"
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
