import { Progress } from "@/components/ui/progress"

interface GameProgressProps {
  currentRound: number
  totalRounds: number
  scores: Array<{ score: number }>
}

export function GameProgress({ currentRound, totalRounds, scores }: GameProgressProps) {
  const totalScore = scores.reduce((sum, round) => sum + round.score, 0)

  return (
    <div className="flex items-center gap-4">
      <div className="text-sm font-medium">
        Round {currentRound}/{totalRounds}
      </div>
      <div className="flex items-center gap-2">
        <div className="text-sm font-medium">Score:</div>
        <div className="text-sm font-bold">{totalScore}</div>
      </div>
      <div className="w-32">
        <Progress value={(currentRound / totalRounds) * 100} className="h-2" />
      </div>
    </div>
  )
}
