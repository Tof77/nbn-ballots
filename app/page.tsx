"use client"

import { useState } from "react"
import StreamingExtractionForm from "@/components/StreamingExtractionForm"

interface ScreenshotInfo {
  name: string
  url: string
}

export default function Home() {
  const [results, setResults] = useState<any[]>([])
  const [screenshotUrls, setScreenshotUrls] = useState<ScreenshotInfo[]>([])
  const [useStreamingExtraction, setUseStreamingExtraction] = useState(true)

  // Fonction pour gérer la réception d'un vote individuel
  const handleVoteReceived = (vote: any) => {
    setResults((prevResults) => {
      // Vérifier si le vote existe déjà
      const existingIndex = prevResults.findIndex((v) => v.id === vote.id)

      if (existingIndex >= 0) {
        // Remplacer le vote existant
        const newResults = [...prevResults]
        newResults[existingIndex] = vote
        return newResults
      } else {
        // Ajouter le nouveau vote
        return [...prevResults, vote]
      }
    })
  }

  // Fonction pour gérer la fin de l'extraction
  const handleExtractionComplete = () => {
    // Rien à faire ici maintenant que nous avons supprimé le mode démo
  }

  // Fonction pour gérer le début de l'extraction
  const handleExtractionStart = () => {
    // Réinitialiser les résultats
    setResults([])
    setScreenshotUrls([])
  }

  // Fonction pour gérer les erreurs
  const handleError = (error: string) => {
    console.error("Erreur d'extraction:", error)
  }

  // Fonction pour gérer les résultats de l'extraction standard
  const handleResultsReceived = (newResults: any[], screenshots: ScreenshotInfo[] = []) => {
    setResults(newResults)
    setScreenshotUrls(screenshots)
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-4 md:p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm">
        <h1 className="text-3xl font-bold text-center mb-8">NBN Ballots Extractor</h1>

        <div className="mb-8">
          <StreamingExtractionForm
            onVoteReceived={handleVoteReceived}
            onExtractionComplete={handleExtractionComplete}
            onExtractionStart={handleExtractionStart}
            onError={handleError}
          />
        </div>
      </div>
    </main>
  )
}
