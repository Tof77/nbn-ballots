export type VoteStatus = "closed" | "ongoing"

export interface FileData {
  id: string
  name: string
  content: any // Contenu du fichier Excel parsé
  type: "NBN" | "CEN/ISO"
}

export interface ProcessedResult {
  data: any // Données combinées
  fileName: string
}

export interface AppState {
  step: number
  voteStatus: VoteStatus
  files: FileData[]
  nbnFile: FileData | null
  cenIsoFiles: FileData[]
  isProcessing: boolean
  result: ProcessedResult | null
  error: string | null
}
