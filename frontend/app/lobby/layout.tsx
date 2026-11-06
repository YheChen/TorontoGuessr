import type React from "react";
import { PlayPausedScreen } from "@/components/site/play-paused";
import { PLAY_PAUSED } from "@/lib/play-status";

/**
 * While play is paused no lobby opens, from the multiplayer page or a shared
 * lobby code. Its rounds would load Google Maps and Street View like any other
 * game, so it gets the same pause as /game.
 */
export default function LobbyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return PLAY_PAUSED ? <PlayPausedScreen /> : children;
}
