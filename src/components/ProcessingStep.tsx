"use client"

import type React from "react"
import type { FileData } from "../types"

interface ProcessingStepProps {
  nbnFile: FileData | null
  cenIsoFiles: FileData[]
  onProcess: () => Promise<void>
  onBack: () => void
  isProcessing: boolean
}

const ProcessingStep: React.FC<ProcessingStepProps> = ({ nbnFile, cenIsoFiles, onProcess, onBack, isProcessing }) => {
  const isReadyToProcess = nbnFile && cenIsoFiles.length > 0

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4">Vérification et traitement</h2>

      <div className="space-y-4">
        <div>
          <h3 className="font-medium text-gray-700">Fichier NBN:</h3>
          {nbnFile ? (
            <p className="text-green-600 flex items-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 mr-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {nbnFile.name}
            </p>
          ) : (
            <p className="text-red-500">Aucun fichier NBN téléchargé</p>
          )}
        </div>

        <div>
          <h3 className="font-medium text-gray-700">Fichiers CEN/ISO:</h3>
          {cenIsoFiles.length > 0 ? (
            <ul className="space-y-1">
              {cenIsoFiles.map((file) => (
                <li key={file.id} className="text-green-600 flex items-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 mr-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {file.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-red-500">Aucun fichier CEN/ISO téléchargé</p>
          )}
        </div>
      </div>

      <div className="mt-6 flex space-x-4">
        <button
          onClick={onBack}
          className="border border-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-50 transition-colors"
          disabled={isProcessing}
        >
          Retour
        </button>

        <button
          onClick={onProcess}
          className={`px-4 py-2 rounded transition-colors ${
            isReadyToProcess
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-gray-300 text-gray-500 cursor-not-allowed"
          }`}
          disabled={!isReadyToProcess || isProcessing}
        >
          {isProcessing ? (
            <span className="flex items-center">
              <svg
                className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Traitement en cours...
            </span>
          ) : (
            "Traiter les fichiers"
          )}
        </button>
      </div>
    </div>
  )
}

export default ProcessingStep
