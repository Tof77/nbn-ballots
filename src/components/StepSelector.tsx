"use client"

import type React from "react"
import type { VoteStatus } from "../types"

interface StepSelectorProps {
  voteStatus: VoteStatus
  onVoteStatusChange: (status: VoteStatus) => void
  onNext: () => void
}

const StepSelector: React.FC<StepSelectorProps> = ({ voteStatus, onVoteStatusChange, onNext }) => {
  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4">Sélectionnez le type de vote</h2>

      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <input
            type="radio"
            id="ongoing"
            name="voteStatus"
            value="ongoing"
            checked={voteStatus === "ongoing"}
            onChange={() => onVoteStatusChange("ongoing")}
            className="h-4 w-4 text-blue-600"
          />
          <label htmlFor="ongoing" className="text-gray-700">
            Votes en cours
          </label>
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="radio"
            id="closed"
            name="voteStatus"
            value="closed"
            checked={voteStatus === "closed"}
            onChange={() => onVoteStatusChange("closed")}
            className="h-4 w-4 text-blue-600"
          />
          <label htmlFor="closed" className="text-gray-700">
            Votes clôturés
          </label>
        </div>
      </div>

      <div className="mt-6">
        <button
          onClick={onNext}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
        >
          Continuer
        </button>
      </div>
    </div>
  )
}

export default StepSelector
