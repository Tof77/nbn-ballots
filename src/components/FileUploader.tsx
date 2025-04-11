"use client"

import type React from "react"
import { useRef, useState } from "react"
import type { FileData } from "../types"

interface FileUploaderProps {
  fileType: "NBN" | "CEN/ISO"
  onFileUpload: (file: File, type: "NBN" | "CEN/ISO") => Promise<void>
  uploadedFiles: FileData[]
  onFileRemove: (id: string) => void
  isProcessing: boolean
}

const FileUploader: React.FC<FileUploaderProps> = ({
  fileType,
  onFileUpload,
  uploadedFiles,
  onFileRemove,
  isProcessing,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileUpload(e.target.files[0], fileType)
      // Réinitialiser l'input pour permettre de télécharger le même fichier à nouveau
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileUpload(e.dataTransfer.files[0], fileType)
    }
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4">
        Télécharger {fileType === "NBN" ? "le fichier NBN" : "les fichiers CEN/ISO"}
      </h2>

      <div
        className={`border-2 border-dashed p-8 rounded-lg text-center cursor-pointer transition-colors ${
          isDragging ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-blue-400"
        }`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".xlsx,.xls"
          className="hidden"
          disabled={isProcessing}
        />

        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-12 w-12 mx-auto text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>

        <p className="mt-2 text-sm text-gray-600">Cliquez pour sélectionner ou glissez-déposez un fichier Excel</p>
        <p className="text-xs text-gray-500 mt-1">Formats acceptés: .xlsx, .xls</p>
      </div>

      {uploadedFiles.length > 0 && (
        <div className="mt-4">
          <h3 className="font-medium text-gray-700 mb-2">Fichiers téléchargés:</h3>
          <ul className="space-y-2">
            {uploadedFiles.map((file) => (
              <li key={file.id} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                <span className="text-sm truncate max-w-xs">{file.name}</span>
                <button
                  onClick={() => onFileRemove(file.id)}
                  className="text-red-500 hover:text-red-700"
                  disabled={isProcessing}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default FileUploader
