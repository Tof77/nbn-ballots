"use client"

import { useState } from "react"
import VoteExtractionForm from "@/components/VoteExtractionForm"
import ChunkedExtractionForm from "@/components/ChunkedExtractionForm"
import ResultsDisplay from "@/components/ResultsDisplay"

interface ScreenshotInfo {
  name: string
  url: string
}

export default function Home() {
  const [results, setResults] = useState<any[]>([])
  const [demoMode, setDemoMode] = useState(false)
  const [screenshotUrls, setScreenshotUrls] = useState<ScreenshotInfo[]>([])
  const [useChunkedExtraction, setUseChunkedExtraction] = useState(true)

  const handleResultsReceived = (newResults: any[], isDemoMode = false, screenshots: ScreenshotInfo[] = []) => {
    setResults(newResults)
    setDemoMode(isDemoMode)
    setScreenshotUrls(screenshots)
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <h1 className="text-2xl font-bold text-center mb-6">NBN Ballots - Extraction automatique</h1>

      <div className="max-w-6xl mx-auto">
        <div className="mb-4 flex justify-end">
          <button
            className={`px-4 py-2 rounded-md text-sm font-medium ${useChunkedExtraction ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800"}`}
            onClick={() => setUseChunkedExtraction(true)}
          >
            Mode optimisé
          </button>
          <button
            className={`ml-2 px-4 py-2 rounded-md text-sm font-medium ${!useChunkedExtraction ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800"}`}
            onClick={() => setUseChunkedExtraction(false)}
          >
            Mode standard
          </button>
        </div>

        {useChunkedExtraction ? (
          <ChunkedExtractionForm onResultsReceived={handleResultsReceived} />
        ) : (
          <VoteExtractionForm onResultsReceived={handleResultsReceived} />
        )}

        {results.length > 0 && <ResultsDisplay results={results} demoMode={demoMode} screenshotUrls={screenshotUrls} />}
      </div>
    </div>
  )
}
