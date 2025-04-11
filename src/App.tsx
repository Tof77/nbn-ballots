"use client"

import type React from "react"
import { useAppState } from "./hooks/useAppState"
import Header from "./components/Header"
import StepSelector from "./components/StepSelector"
import FileUploader from "./components/FileUploader"
import ProcessingStep from "./components/ProcessingStep"
import ResultStep from "./components/ResultStep"
import ErrorDisplay from "./components/ErrorDisplay"

const App: React.FC = () => {
  const { state, setVoteStatus, goToNextStep, goToPreviousStep, resetState, addFile, removeFile, processAllFiles } =
    useAppState()

  const clearError = () => {
    // Réinitialiser l'erreur
    resetState()
  }

  const renderCurrentStep = () => {
    switch (state.step) {
      case 1:
        return <StepSelector voteStatus={state.voteStatus} onVoteStatusChange={setVoteStatus} onNext={goToNextStep} />
      case 2:
        return (
          <FileUploader
            fileType="NBN"
            onFileUpload={addFile}
            uploadedFiles={state.files.filter((file) => file.type === "NBN")}
            onFileRemove={removeFile}
            isProcessing={state.isProcessing}
          />
        )
      case 3:
        return (
          <FileUploader
            fileType="CEN/ISO"
            onFileUpload={addFile}
            uploadedFiles={state.files.filter((file) => file.type === "CEN/ISO")}
            onFileRemove={removeFile}
            isProcessing={state.isProcessing}
          />
        )
      case 4:
        return (
          <ProcessingStep
            nbnFile={state.nbnFile}
            cenIsoFiles={state.cenIsoFiles}
            onProcess={processAllFiles}
            onBack={goToPreviousStep}
            isProcessing={state.isProcessing}
          />
        )
      case 5:
        return <ResultStep result={state.result} onReset={resetState} />
      default:
        return <div>Étape inconnue</div>
    }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Header currentStep={state.step} totalSteps={5} />

      <main className="container mx-auto py-8 px-4">
        <ErrorDisplay message={state.error} onDismiss={clearError} />

        {renderCurrentStep()}

        {state.step > 1 && state.step < 5 && (
          <div className="mt-6 flex justify-between">
            <button
              onClick={goToPreviousStep}
              className="text-blue-600 hover:text-blue-800 transition-colors"
              disabled={state.isProcessing}
            >
              &larr; Étape précédente
            </button>

            {state.step < 4 && (
              <button
                onClick={goToNextStep}
                className="text-blue-600 hover:text-blue-800 transition-colors"
                disabled={state.isProcessing}
              >
                Étape suivante &rarr;
              </button>
            )}
          </div>
        )}
      </main>

      <footer className="bg-gray-800 text-white py-4 mt-8">
        <div className="container mx-auto px-4 text-center">
          <p>&copy; {new Date().getFullYear()} NBN Ballots - Outil de combinaison de fichiers Excel</p>
        </div>
      </footer>
    </div>
  )
}

export default App
