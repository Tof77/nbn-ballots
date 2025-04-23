"use client"

import { useState } from "react"

interface ScreenshotInfo {
  name: string
  url: string
}

interface ResultsDisplayProps {
  results: any[]
  screenshotUrls: ScreenshotInfo[]
}

export default function ResultsDisplay({ results, screenshotUrls }: ResultsDisplayProps) {
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null)

  // Fonction pour formater les résultats en CSV
  const formatResultsAsCSV = () => {
    if (!results.length) return ""

    // Obtenir les en-têtes à partir des clés du premier résultat
    const headers = Object.keys(results[0]).filter((key) => key !== "id" && key !== "timestamp")
    const csvHeader = ["id", ...headers].join(",")

    // Formater chaque ligne de résultat
    const csvRows = results.map((result) => {
      const values = [
        result.id,
        ...headers.map((header) => {
          // Échapper les virgules et les guillemets dans les valeurs
          const value = String(result[header] || "")
          if (value.includes(",") || value.includes('"')) {
            return `"${value.replace(/"/g, '""')}"`
          }
          return value
        }),
      ]
      return values.join(",")
    })

    // Combiner l'en-tête et les lignes
    return [csvHeader, ...csvRows].join("\n")
  }

  // Fonction pour télécharger les résultats en CSV
  const downloadCSV = () => {
    const csv = formatResultsAsCSV()
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.setAttribute("href", url)
    link.setAttribute(
      "download",
      `extraction_resultats_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mt-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Résultats ({results.length} votes)</h2>
        <button onClick={downloadCSV} className="bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700">
          Télécharger CSV
        </button>
      </div>

      {screenshotUrls.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-2">Captures d'écran</h3>
          <div className="flex flex-wrap gap-2">
            {screenshotUrls.map((screenshot, index) => (
              <div key={index} className="relative">
                <img
                  src={screenshot.url || "/placeholder.svg"}
                  alt={`Capture ${index + 1}`}
                  className="w-24 h-24 object-cover cursor-pointer border border-gray-300 rounded"
                  onClick={() => setSelectedScreenshot(screenshot.url)}
                />
                <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-1 truncate">
                  {screenshot.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedScreenshot && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedScreenshot(null)}
        >
          <div className="relative max-w-4xl max-h-full">
            <button
              className="absolute top-2 right-2 bg-white rounded-full p-2 text-black"
              onClick={(e) => {
                e.stopPropagation()
                setSelectedScreenshot(null)
              }}
            >
              ✕
            </button>
            <img
              src={selectedScreenshot || "/placeholder.svg"}
              alt="Capture d'écran agrandie"
              className="max-w-full max-h-[90vh] object-contain"
            />
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {results.length > 0 &&
                Object.keys(results[0])
                  .filter((key) => key !== "timestamp")
                  .map((key) => (
                    <th
                      key={key}
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {key}
                    </th>
                  ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {results.map((result, index) => (
              <tr key={index} className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                {Object.entries(result)
                  .filter(([key]) => key !== "timestamp")
                  .map(([key, value]) => (
                    <td key={key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {String(value)}
                    </td>
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
