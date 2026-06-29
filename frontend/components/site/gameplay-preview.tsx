import { Clock, MapPin, Crosshair } from "lucide-react";
import { TowerGlyph } from "@/components/site/brand-mark";
import { cn } from "@/lib/utils";

/**
 * A stylized, static preview of the in-game experience for the landing hero.
 * Decorative only: it never loads Google Maps, keeping the homepage light.
 */
export function GameplayPreview({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "glass-strong relative aspect-[4/3] w-full overflow-hidden rounded-3xl shadow-elevated ring-1 ring-white/10",
        className,
      )}
    >
      {/* "Street View" panorama */}
      <img
        src="/TorontoGuessrThumbnail.webp"
        alt=""
        className="absolute inset-0 size-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/30" />

      {/* top HUD row */}
      <div className="absolute inset-x-4 top-4 flex items-center justify-between">
        <span className="rounded-full bg-black/45 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md ring-1 ring-white/15">
          Round 2 / 5
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md ring-1 ring-white/15">
          <TowerGlyph className="size-3.5 text-toronto-sky" />
          <span className="tabular">3,420</span>
        </span>
      </div>

      {/* timer chip */}
      <div className="absolute bottom-4 left-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md ring-1 ring-white/15">
          <Clock className="size-3.5 text-toronto-sky" />
          <span className="tabular">0:42</span>
        </span>
      </div>

      {/* inset guess map */}
      <div className="absolute bottom-4 right-4 w-[44%] max-w-[220px]">
        <div className="overflow-hidden rounded-xl bg-card/95 shadow-elevated ring-1 ring-border/60">
          <div className="relative h-24 bg-map-grid-fine bg-secondary/60">
            <span className="absolute left-1/2 top-1/2 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-toronto-red text-white shadow-md animate-pulse-ring">
              <MapPin className="size-3.5" />
            </span>
          </div>
          <div className="flex items-center justify-center gap-1.5 bg-primary px-3 py-2 text-[11px] font-semibold text-primary-foreground">
            <Crosshair className="size-3.5" />
            Submit guess
          </div>
        </div>
      </div>
    </div>
  );
}
