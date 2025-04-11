import type { FileData, ProcessedResult, VoteStatus } from "../types"

export const processFiles = async (
  nbnFile: FileData,
  cenIsoFiles: FileData[],
  voteStatus: VoteStatus,
): Promise<ProcessedResult> => {
  // Simulons un traitement asynchrone
  return new Promise((resolve) => {
    setTimeout(() => {
      // Logique de traitement différente selon le statut du vote
      const processedData =
        voteStatus === "closed" ? processClosedVotes(nbnFile, cenIsoFiles) : processOngoingVotes(nbnFile, cenIsoFiles)

      const fileName = `combined_votes_${voteStatus}_${new Date().toISOString().slice(0, 10)}.xlsx`

      resolve({
        data: processedData,
        fileName,
      })
    }, 1000)
  })
}

const processClosedVotes = (nbnFile: FileData, cenIsoFiles: FileData[]) => {
  // Logique spécifique pour combiner les votes clôturés
  // Ceci est une simulation, à remplacer par la logique réelle
  return {
    combinedData: "Données combinées pour votes clôturés",
    nbnData: nbnFile.content,
    cenIsoData: cenIsoFiles.map((file) => file.content),
  }
}

const processOngoingVotes = (nbnFile: FileData, cenIsoFiles: FileData[]) => {
  // Logique spécifique pour combiner les votes en cours
  // Ceci est une simulation, à remplacer par la logique réelle
  return {
    combinedData: "Données combinées pour votes en cours",
    nbnData: nbnFile.content,
    cenIsoData: cenIsoFiles.map((file) => file.content),
  }
}

export const downloadExcelFile = (result: ProcessedResult) => {
  // Dans une implémentation réelle, vous utiliseriez une bibliothèque comme xlsx
  // pour générer un fichier Excel à partir des données et le télécharger

  // Simulation d'un téléchargement
  console.log(`Téléchargement du fichier ${result.fileName} avec les données:`, result.data)

  // Créer un élément <a> pour déclencher le téléchargement
  const element = document.createElement("a")
  const file = new Blob([JSON.stringify(result.data)], { type: "application/json" })
  element.href = URL.createObjectURL(file)
  element.download = result.fileName
  document.body.appendChild(element)
  element.click()
  document.body.removeChild(element)
}
