"use client"

import { useState } from "react"
import VoteExtractionForm from "@/components/VoteExtractionForm"
import ResultsDisplay from "@/components/ResultsDisplay"

export default function Home() {
  const [results, setResults] = useState<any[]>([])

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <h1 className="text-2xl font-bold text-center mb-6">NBN Ballots - Extraction automatique</h1>

      <div className="max-w-6xl mx-auto">
        <VoteExtractionForm onResultsReceived={setResults} />

        {results.length > 0 && <ResultsDisplay results={results} />}
      </div>
    </div>
  )
}
