import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

export function ScoreDisplay() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Current Game</CardTitle>
        <CardDescription>Round 1 of 5</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-sm font-medium">Score</span>
              <span className="text-sm font-medium">0 pts</span>
            </div>
            <Progress value={0} className="h-2" />
          </div>

          <div className="grid grid-cols-5 gap-1">
            {[1, 2, 3, 4, 5].map((round) => (
              <div key={round} className={`h-2 rounded ${round === 1 ? "bg-[#00205B]" : "bg-gray-200"}`} />
            ))}
          </div>

          <div className="text-xs text-muted-foreground">
            <p>Best score: 0 pts</p>
            <p>Total games played: 0</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
