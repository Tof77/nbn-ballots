"use client"

import { useState } from "react"
import VoteExtractionForm from "@/components/VoteExtractionForm"
import StreamingExtractionForm from "@/components/StreamingExtractionForm"
import ResultsDisplay from "@/components/ResultsDisplay"

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
    <div className="min-h-screen bg-gray-100 p-4">
      <h1 className="text-2xl font-bold text-center mb-6">NBN Ballots - Extraction automatique</h1>

      <div className="max-w-6xl mx-auto">
        <div className="mb-4 flex justify-end">
          <button
            className={`px-4 py-2 rounded-md text-sm font-medium ${useStreamingExtraction ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800"}`}
            onClick={() => setUseStreamingExtraction(true)}
          >
            Mode streaming
          </button>
          <button
            className={`ml-2 px-4 py-2 rounded-md text-sm font-medium ${!useStreamingExtraction ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800"}`}
            onClick={() => setUseStreamingExtraction(false)}
          >
            Mode standard
          </button>
        </div>

        {useStreamingExtraction ? (
          <StreamingExtractionForm
            onVoteReceived={handleVoteReceived}
            onExtractionComplete={handleExtractionComplete}
            onExtractionStart={handleExtractionStart}
            onError={handleError}
          />
        ) : (
          <VoteExtractionForm onResultsReceived={handleResultsReceived} />
        )}

        {results.length > 0 && <ResultsDisplay results={results} screenshotUrls={screenshotUrls} />}
      </div>
    </div>
  )
}
