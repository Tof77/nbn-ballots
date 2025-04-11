"use client"

import { useState } from "react"
import { v4 as uuidv4 } from "uuid"
import type { AppState, FileData, VoteStatus } from "../types"
import { processFiles } from "../utils/fileProcessor"

const initialState: AppState = {
  step: 1,
  voteStatus: "ongoing",
  files: [],
  nbnFile: null,
  cenIsoFiles: [],
  isProcessing: false,
  result: null,
  error: null,
}

export const useAppState = () => {
  const [state, setState] = useState<AppState>(initialState)

  const setVoteStatus = (status: VoteStatus) => {
    setState((prev) => ({ ...prev, voteStatus: status }))
  }

  const goToNextStep = () => {
    setState((prev) => ({ ...prev, step: prev.step + 1 }))
  }

  const goToPreviousStep = () => {
    setState((prev) => ({ ...prev, step: Math.max(1, prev.step - 1) }))
  }

  const goToStep = (step: number) => {
    setState((prev) => ({ ...prev, step }))
  }

  const resetState = () => {
    setState(initialState)
  }

  const addFile = async (file: File, type: "NBN" | "CEN/ISO") => {
    try {
      setState((prev) => ({ ...prev, isProcessing: true, error: null }))

      // Ici, nous simulons le parsing du fichier Excel
      // Dans une implémentation réelle, vous utiliseriez une bibliothèque comme xlsx
      const content = await new Promise((resolve) => {
        setTimeout(() => {
          resolve({ sheets: [{ name: "Sheet1", data: [["Exemple de données"]] }] })
        }, 500)
      })

      const fileData: FileData = {
        id: uuidv4(),
        name: file.name,
        content,
        type,
      }

      if (type === "NBN") {
        setState((prev) => ({
          ...prev,
          nbnFile: fileData,
          files: [...prev.files.filter((f) => f.type !== "NBN"), fileData],
          isProcessing: false,
        }))
      } else {
        setState((prev) => ({
          ...prev,
          cenIsoFiles: [...prev.cenIsoFiles, fileData],
          files: [...prev.files, fileData],
          isProcessing: false,
        }))
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: `Erreur lors du traitement du fichier: ${error instanceof Error ? error.message : String(error)}`,
        isProcessing: false,
      }))
    }
  }

  const removeFile = (id: string) => {
    setState((prev) => {
      const updatedFiles = prev.files.filter((file) => file.id !== id)
      const updatedNbnFile = prev.nbnFile?.id === id ? null : prev.nbnFile
      const updatedCenIsoFiles = prev.cenIsoFiles.filter((file) => file.id !== id)

      return {
        ...prev,
        files: updatedFiles,
        nbnFile: updatedNbnFile,
        cenIsoFiles: updatedCenIsoFiles,
      }
    })
  }

  const processAllFiles = async () => {
    try {
      setState((prev) => ({ ...prev, isProcessing: true, error: null }))

      if (!state.nbnFile || state.cenIsoFiles.length === 0) {
        throw new Error("Veuillez télécharger au moins un fichier NBN et un fichier CEN/ISO")
      }

      const result = await processFiles(state.nbnFile, state.cenIsoFiles, state.voteStatus)

      setState((prev) => ({
        ...prev,
        result,
        isProcessing: false,
        step: prev.step + 1,
      }))
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: `Erreur lors du traitement des fichiers: ${error instanceof Error ? error.message : String(error)}`,
        isProcessing: false,
      }))
    }
  }

  return {
    state,
    setVoteStatus,
    goToNextStep,
    goToPreviousStep,
    goToStep,
    resetState,
    addFile,
    removeFile,
    processAllFiles,
  }
}
