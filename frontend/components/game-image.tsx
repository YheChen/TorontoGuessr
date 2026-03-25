import { Card } from "@/components/ui/card"

interface GameImageProps {
  imageUrl: string
}

export function GameImage({ imageUrl }: GameImageProps) {
  return (
    <Card className="overflow-hidden">
      <div className="relative h-[500px] w-full">
        <img
          src={imageUrl || "/placeholder.svg"}
          alt="Toronto street view with blurred signs"
          className="h-full w-full object-cover"
        />
        <div className="absolute bottom-2 right-2 bg-black/50 px-2 py-1 text-xs text-white rounded">
          Street View Image
        </div>
      </div>
    </Card>
  )
}
