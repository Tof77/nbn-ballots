"use client"

import type React from "react"

// Ajouter ces imports et interfaces
import { useEffect, useRef, useState, useCallback } from "react"
import { CheckIcon, XCircleIcon, ClockIcon, InfoIcon } from "@heroicons/react/24/outline"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

// Ajouter cette interface
interface ExtractionStatus {
  id: string
  status: "pending" | "in-progress" | "completed" | "failed"
  progress?: number
  message?: string
  startTime: number
  endTime?: number
  result?: any
}

interface VoteExtractionFormProps {
  onResultsReceived: (votes: any[], isDemoMode: boolean, screenshots: string[]) => void
  setDebugInfo: (info: string | null) => void
  setError: (error: string) => void
  setLoading: (loading: boolean) => void
  username: string
  password: string
  commissionId: string
  startDate: string
  extractDetails: boolean
  encryptCredentials: (
    username: string,
    password: string,
  ) => Promise<{ encryptedUsername: string; encryptedPassword: string }>
  warmupRenderApi: () => Promise<{ success: boolean; message: string; status?: string; statusCode?: number }>
  isServiceUnavailable: (statusCode: number) => boolean
  setRenderApiStatus: (status: any) => void
  setDemoMode: (demoMode: boolean) => void
  demoMode: boolean
}

// Dans le composant VoteExtractionForm, ajouter ces états
const VoteExtractionForm = ({
  onResultsReceived,
  setDebugInfo,
  setError,
  setLoading,
  username,
  password,
  commissionId,
  startDate,
  extractDetails,
  encryptCredentials,
  warmupRenderApi,
  isServiceUnavailable,
  setRenderApiStatus,
  setDemoMode,
  demoMode,
}: VoteExtractionFormProps) => {
  const [extractionId, setExtractionId] = useState<string | null>(null)
  const [extractionStatus, setExtractionStatus] = useState<ExtractionStatus | null>(null)
  const [pollingInterval, setPollingInterval] = useState<number | null>(null)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Ajouter cette fonction pour vérifier l'état de l'extraction
  const checkExtractionStatus = useCallback(
    async (id: string) => {
      if (!id) return

      try {
        const response = await fetch(`/api/extract-votes?id=${id}`, {
          headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
            Expires: "0",
          },
        })

        if (!response.ok) {
          console.error("Erreur lors de la vérification de l'état de l'extraction:", response.status)
          setDebugInfo(
            (prev) => `${prev}\n\nErreur lors de la vérification de l'état de l'extraction: ${response.status}`,
          )
          return
        }

        const status = await response.json()
        setExtractionStatus(status)
        setDebugInfo((prev) => `${prev}\n\nÉtat de l'extraction: ${JSON.stringify(status, null, 2)}`)

        // Si l'extraction est terminée ou a échoué, arrêter le polling
        if (status.status === "completed" || status.status === "failed") {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current)
            pollingIntervalRef.current = null
            setPollingInterval(null)
          }

          // Si l'extraction est terminée avec succès, traiter les résultats
          if (status.status === "completed" && status.result) {
            const isDemoMode = !!status.result.debug?.demoMode
            const screenshots = status.result.debug?.screenshotUrls || []
            onResultsReceived(status.result.votes || [], isDemoMode, screenshots)
          } else if (status.status === "failed") {
            setError(status.message || "L'extraction a échoué")
          }
        }
      } catch (error) {
        console.error("Erreur lors de la vérification de l'état de l'extraction:", error)
        setDebugInfo((prev) => `${prev}\n\nErreur lors de la vérification de l'état de l'extraction: ${error}`)
      }
    },
    [onResultsReceived, setDebugInfo, setError],
  )

  // Ajouter cet effet pour gérer le polling
  useEffect(() => {
    // Si nous avons un ID d'extraction mais pas d'intervalle de polling, démarrer le polling
    if (extractionId && !pollingIntervalRef.current) {
      // Vérifier immédiatement l'état
      checkExtractionStatus(extractionId)

      // Puis démarrer le polling toutes les 5 secondes
      pollingIntervalRef.current = setInterval(() => {
        checkExtractionStatus(extractionId)
      }, 5000)
      setPollingInterval(5000)
    }

    // Nettoyer l'intervalle lorsque le composant est démonté
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [extractionId, checkExtractionStatus])

  // Modifier la fonction handleSubmit pour utiliser le nouveau mécanisme
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setDebugInfo(null)
    setDemoMode(false)
    setExtractionId(null)
    setExtractionStatus(null)

    // Arrêter tout polling en cours
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
      setPollingInterval(null)
    }

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
        forceDemoMode: isMaintenanceMode || demoMode,
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

      // Démarrer l'extraction
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
        })

        // Ajouter des logs pour le débogage
        console.log("Statut de la réponse:", res.status, res.statusText)
        setDebugInfo((prev) => `${prev}\n\nStatut de la réponse: ${res.status} ${res.statusText}`)

        const responseText = await res.text()
        console.log("Réponse brute de l'API:", responseText)
        setDebugInfo((prev) => `${prev}\n\nRéponse brute de l'API: ${responseText}`)

        let json: any

        try {
          json = JSON.parse(responseText)
          console.log("Réponse JSON parsée:", json)
          setDebugInfo((prev) => `${prev}\n\nRéponse JSON parsée: ${JSON.stringify(json, null, 2)}`)

          // Vérifier si nous avons un ID d'extraction
          if (json.extractionId) {
            setExtractionId(json.extractionId)
            setDebugInfo((prev) => `${prev}\n\nID d'extraction reçu: ${json.extractionId}`)
            setLoading(true) // Maintenir l'état de chargement pendant le polling

            // Le polling sera démarré par l'effet useEffect
          } else if (json.votes) {
            // Si nous avons directement les votes (mode démo), traiter les résultats
            const isDemoMode = !!json.debug?.demoMode
            const screenshots = json.debug?.screenshotUrls || []
            onResultsReceived(json.votes || [], isDemoMode, screenshots)
            setLoading(false)
          } else if (json.error) {
            setError(json.error || "Une erreur est survenue")
            setLoading(false)
          }
        } catch (parseError: unknown) {
          console.error("Erreur lors du parsing de la réponse JSON:", parseError)
          setDebugInfo(
            (prev) =>
              `${prev}\n\nErreur lors du parsing de la réponse JSON: ${parseError}\nRéponse brute de l'API (non-JSON): ${responseText}`,
          )
          setError("La réponse de l'API n'est pas un JSON valide")
          setLoading(false)
        }
      } catch (error: unknown) {
        console.error("Erreur lors de l'extraction:", error)
        setDebugInfo(
          (prev) => `${prev}\n\nErreur lors de l'extraction: ${error instanceof Error ? error.message : String(error)}`,
        )
        setError(error instanceof Error ? error.message : String(error) || "Une erreur est survenue")
        setLoading(false)
      }
    } catch (err: any) {
      console.error("Erreur lors de l'extraction:", err)
      setError(err.message || "Une erreur est survenue")
      setLoading(false)
    }
  }

  // Ajouter un composant pour afficher la progression de l'extraction
  const renderExtractionProgress = () => {
    if (!extractionStatus) return null

    const getStatusColor = () => {
      switch (extractionStatus.status) {
        case "completed":
          return "bg-green-100 border-green-300 text-green-800"
        case "failed":
          return "bg-red-100 border-red-300 text-red-800"
        case "in-progress":
          return "bg-blue-100 border-blue-300 text-blue-800"
        case "pending":
          return "bg-yellow-100 border-yellow-300 text-yellow-800"
        default:
          return "bg-gray-100 border-gray-300 text-gray-800"
      }
    }

    const getStatusIcon = () => {
      switch (extractionStatus.status) {
        case "completed":
          return <CheckIcon className="h-5 w-5 text-green-500" />
        case "failed":
          return <XCircleIcon className="h-5 w-5 text-red-500" />
        case "in-progress":
          return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
        case "pending":
          return <ClockIcon className="h-5 w-5 text-yellow-500" />
        default:
          return <InfoIcon className="h-5 w-5 text-gray-500" />
      }
    }

    return (
      <div className={`mt-4 p-4 rounded-md border ${getStatusColor()}`}>
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <div>
            <h3 className="font-medium">
              {extractionStatus.status === "completed"
                ? "Extraction terminée"
                : extractionStatus.status === "failed"
                  ? "Échec de l'extraction"
                  : extractionStatus.status === "in-progress"
                    ? "Extraction en cours"
                    : "Extraction en attente"}
            </h3>
            <p className="text-sm">{extractionStatus.message}</p>
          </div>
        </div>

        {extractionStatus.progress !== undefined && extractionStatus.status === "in-progress" && (
          <div className="mt-2">
            <div className="h-2 w-full bg-blue-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${extractionStatus.progress}%` }}></div>
            </div>
            <p className="text-xs text-right mt-1">{extractionStatus.progress}%</p>
          </div>
        )}

        {pollingInterval && (
          <p className="text-xs mt-2">Vérification de l'état toutes les {pollingInterval / 1000} secondes...</p>
        )}

        {extractionStatus.status === "failed" && (
          <div className="mt-2">
            <Button variant="outline" size="sm" onClick={() => setDemoMode(true)} className="mr-2">
              Utiliser le mode démo
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleSubmit(new Event("submit") as any)}>
              Réessayer
            </Button>
          </div>
        )}
      </div>
    )
  }

  // Ajouter ce composant dans le rendu, juste après le formulaire
  return <>{extractionStatus && renderExtractionProgress()}</>
}

export default VoteExtractionForm
