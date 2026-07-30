"use client";

import { Check, Crown, Hourglass, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { playerColor, rankPlayers } from "@/lib/lobby-client";
import type { LobbyPlayerState } from "@/lib/types";

interface LobbyScoreboardProps {
  players: LobbyPlayerState[];
  hostPlayerId: string;
  youPlayerId: string | null;
  /** Colour index per player id, so pins and rows always match. */
  colorIndex: Map<string, number>;
  /** After a reveal, show this round's score and distance per player. */
  showRoundDetail: boolean;
  /** Before a reveal, show who has locked in a guess. */
  showGuessStatus: boolean;
}

function formatDistance(distance: number | null | undefined): string {
  if (distance === null || distance === undefined) return "No guess";
  if (distance < 1) return `${Math.round(distance * 1000)} m`;
  return `${distance.toFixed(2)} km`;
}

export function LobbyScoreboard({
  players,
  hostPlayerId,
  youPlayerId,
  colorIndex,
  showRoundDetail,
  showGuessStatus,
}: LobbyScoreboardProps) {
  const ranked = rankPlayers(players);

  return (
    <ul className="space-y-2">
      {ranked.map((player, index) => {
        const isYou = player.playerId === youPlayerId;
        const color = playerColor(colorIndex.get(player.playerId) ?? index);
        return (
          <li
            key={player.playerId}
            className={cn(
              "flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5",
              isYou
                ? "border-primary/40 bg-primary/5"
                : "border-border/60 bg-card/50",
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden="true"
                className="size-3 shrink-0 rounded-full ring-2 ring-background"
                style={{ backgroundColor: color }}
              />
              <span className="w-5 shrink-0 text-sm font-medium text-muted-foreground tabular">
                {index + 1}
              </span>
              <span className="truncate font-semibold" title={player.displayName}>
                {player.displayName}
                {isYou && (
                  <span className="ml-1.5 text-xs font-medium text-primary">
                    you
                  </span>
                )}
              </span>
              {player.playerId === hostPlayerId && (
                <Crown
                  className="size-3.5 shrink-0 text-medal-gold"
                  aria-label="Host"
                />
              )}
              {!player.isConnected && (
                <WifiOff
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-label="Left the lobby"
                />
              )}
            </div>

            <div className="flex shrink-0 items-center gap-4 text-right">
              {showGuessStatus && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-xs font-medium",
                    player.hasGuessed ? "text-success" : "text-muted-foreground",
                  )}
                >
                  {player.hasGuessed ? (
                    <>
                      <Check className="size-3.5" />
                      Locked in
                    </>
                  ) : (
                    <>
                      <Hourglass className="size-3.5" />
                      Guessing
                    </>
                  )}
                </span>
              )}
              {showRoundDetail && (
                <span className="text-xs text-muted-foreground tabular">
                  +{(player.roundScore ?? 0).toLocaleString("en-US")}
                  <span className="ml-1.5">
                    {formatDistance(player.roundDistance)}
                  </span>
                </span>
              )}
              <span className="font-bold tabular">
                {player.totalScore.toLocaleString("en-US")}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
