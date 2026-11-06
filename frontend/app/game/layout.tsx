import type React from "react";
import { PlayPausedScreen } from "@/components/site/play-paused";
import { PLAY_PAUSED } from "@/lib/play-status";

/**
 * While play is paused the game never mounts, whichever way a visitor arrives:
 * Play, the daily, a challenge link or a bookmark. So Google Maps and Street
 * View never load, and no game is started on the backend.
 */
export default function GameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return PLAY_PAUSED ? <PlayPausedScreen /> : children;
}
