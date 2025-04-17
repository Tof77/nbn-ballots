"use client"

import { useState } from "react"
import VoteExtractionForm from "@/components/VoteExtractionForm"
import ResultsDisplay from "@/components/ResultsDisplay"

interface ScreenshotInfo {
  name: string
  url: string
}

export default function Home() {
  const [results, setResults] = useState<any[]>([])
  const [demoMode, setDemoMode] = useState(false)
  const [screenshotUrls, setScreenshotUrls] = useState<ScreenshotInfo[]>([])

  const handleResultsReceived = (newResults: any[], isDemoMode = false, screenshots: ScreenshotInfo[] = []) => {
    setResults(newResults)
    setDemoMode(isDemoMode)
    setScreenshotUrls(screenshots)
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <h1 className="text-2xl font-bold text-center mb-6">NBN Ballots - Extraction automatique</h1>

      <div className="max-w-6xl mx-auto">
        <VoteExtractionForm onResultsReceived={handleResultsReceived} />

        {results.length > 0 && <ResultsDisplay results={results} demoMode={demoMode} screenshotUrls={screenshotUrls} />}
      </div>
    </div>
  )
}
