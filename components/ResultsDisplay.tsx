"use client"

import { useState } from "react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

interface VoteDetail {
  participant: string
  vote: string
  castBy: string
  date: string
}

interface Vote {
  id: string
  ref: string
  title: string
  committee: string
  votes: string
  result: string
  status: string
  openingDate: string
  closingDate: string
  role: string
  sourceType: string
  source: string
  voteDetails?: VoteDetail[]
}

interface ResultsDisplayProps {
  results: Vote[]
}

export default function ResultsDisplay({ results }: ResultsDisplayProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [sortField, setSortField] = useState<keyof Vote>("closingDate")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")

  const handleSort = (field: keyof Vote) => {
    if (field === sortField) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("asc")
    }
  }

  const filteredResults = results.filter(
    (vote) =>
      vote.ref.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vote.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vote.result.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const sortedResults = [...filteredResults].sort((a, b) => {
    if (a[sortField] < b[sortField]) return sortDirection === "asc" ? -1 : 1
    if (a[sortField] > b[sortField]) return sortDirection === "asc" ? 1 : -1
    return 0
  })

  const downloadCSV = () => {
    const csvContent = [
      ["ID", "Reference", "Title", "Committee", "Source", "Closing Date", "Status", "Result", "Votes"],
      ...sortedResults.map((r) => [
        r.id,
        r.ref,
        r.title || "",
        r.committee,
        r.source,
        r.closingDate,
        r.status,
        r.result,
        r.votes,
      ]),
    ]
      .map((row) => row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(","))
      .join("\n")

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.setAttribute("href", url)
    link.setAttribute("download", `votes_export_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const downloadDetailedCSV = () => {
    // Créer un CSV avec les détails des votes
    const rows: string[][] = []

    // En-tête
    rows.push([
      "ID",
      "Reference",
      "Title",
      "Committee",
      "Source",
      "Closing Date",
      "Status",
      "Result",
      "Participant",
      "Vote",
      "Cast By",
      "Date",
    ])

    // Données
    sortedResults.forEach((vote) => {
      if (vote.voteDetails && vote.voteDetails.length > 0) {
        vote.voteDetails.forEach((detail) => {
          rows.push([
            vote.id,
            vote.ref,
            vote.title || "",
            vote.committee,
            vote.source,
            vote.closingDate,
            vote.status,
            vote.result,
            detail.participant,
            detail.vote,
            detail.castBy,
            detail.date,
          ])
        })
      } else {
        rows.push([
          vote.id,
          vote.ref,
          vote.title || "",
          vote.committee,
          vote.source,
          vote.closingDate,
          vote.status,
          vote.result,
          "",
          "",
          "",
          "",
        ])
      }
    })

    const csvContent = rows
      .map((row) => row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(","))
      .join("\n")

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.setAttribute("href", url)
    link.setAttribute("download", `votes_detailed_export_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <Card className="bg-white rounded-xl shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Résultats ({results.length} votes)</h2>

        <div className="flex space-x-2">
          <input
            type="text"
            placeholder="Rechercher..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border border-gray-300 rounded-md p-2 text-sm"
          />

          <Button onClick={downloadCSV} variant="outline" className="text-sm">
            Télécharger CSV
          </Button>

          <Button onClick={downloadDetailedCSV} className="bg-green-600 text-white hover:bg-green-700 text-sm">
            Télécharger CSV détaillé
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer" onClick={() => handleSort("ref")}>
                Reference {sortField === "ref" && (sortDirection === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("committee")}>
                Committee {sortField === "committee" && (sortDirection === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("source")}>
                Source {sortField === "source" && (sortDirection === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("closingDate")}>
                Closing Date {sortField === "closingDate" && (sortDirection === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("status")}>
                Status {sortField === "status" && (sortDirection === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("result")}>
                Result {sortField === "result" && (sortDirection === "asc" ? "↑" : "↓")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedResults.length > 0 ? (
              sortedResults.map((vote, index) => (
                <TableRow key={index} className="hover:bg-gray-50">
                  <TableCell>
                    <Accordion type="single" collapsible>
                      <AccordionItem value={`item-${index}`}>
                        <AccordionTrigger className="text-sm font-medium text-blue-600 hover:text-blue-800">
                          {vote.ref}
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="p-2 bg-gray-50 rounded-md mb-2">
                            <p className="text-sm font-medium">Titre:</p>
                            <p className="text-sm text-gray-700">{vote.title || "Non disponible"}</p>
                          </div>

                          {vote.voteDetails && vote.voteDetails.length > 0 ? (
                            <div>
                              <p className="text-sm font-medium mb-2">Détails des votes:</p>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Participant</TableHead>
                                    <TableHead>Vote</TableHead>
                                    <TableHead>Cast By</TableHead>
                                    <TableHead>Date</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {vote.voteDetails.map((detail, i) => (
                                    <TableRow key={i}>
                                      <TableCell className="text-xs">{detail.participant}</TableCell>
                                      <TableCell className="text-xs">{detail.vote}</TableCell>
                                      <TableCell className="text-xs">{detail.castBy}</TableCell>
                                      <TableCell className="text-xs">{detail.date}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500">Aucun détail de vote disponible</p>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </TableCell>
                  <TableCell className="text-sm">{vote.committee}</TableCell>
                  <TableCell className="text-sm">{vote.source}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{vote.closingDate}</TableCell>
                  <TableCell>
                    <Badge variant={vote.status === "Closed" ? "secondary" : "outline"}>{vote.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{vote.result}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-gray-500">
                  Aucun résultat trouvé
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  )
}
