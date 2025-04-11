import type { FC } from "react"

interface HeaderProps {
  currentStep: number
  totalSteps: number
}

const Header: FC<HeaderProps> = ({ currentStep, totalSteps }) => {
  return (
    <header className="bg-blue-600 text-white p-4 shadow-md">
      <div className="container mx-auto">
        <h1 className="text-2xl font-bold">NBN Ballots - Combinaison de fichiers Excel</h1>
        <div className="mt-2">
          <p>
            Étape {currentStep} sur {totalSteps}
          </p>
          <div className="w-full bg-blue-800 rounded-full h-2.5 mt-2">
            <div
              className="bg-white h-2.5 rounded-full"
              style={{ width: `${(currentStep / totalSteps) * 100}%` }}
            ></div>
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header
