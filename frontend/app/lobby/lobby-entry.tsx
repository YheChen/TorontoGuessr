"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeading } from "@/components/site/section-heading";
import { createLobby, joinLobby } from "@/lib/api";
import { writeLobbyToken } from "@/lib/lobby-client";

/** Letters and digits only, matching the leaderboard name rules. */
function sanitizeName(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "").slice(0, 10);
}

/** The join code alphabet, uppercased; separators are stripped as you type. */
function sanitizeCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .slice(0, 6);
}

export function LobbyEntry() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCreate = async () => {
    setBusy("create");
    setErrorMessage(null);
    try {
      const lobby = await createLobby(displayName);
      writeLobbyToken(lobby.joinCode, lobby.playerToken);
      router.push(`/lobby/${lobby.joinCode}`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not create a lobby.",
      );
      setBusy(null);
    }
  };

  const handleJoin = async () => {
    if (joinCode.length !== 6) {
      setErrorMessage("Enter the six character lobby code.");
      return;
    }

    setBusy("join");
    setErrorMessage(null);
    try {
      const joined = await joinLobby(joinCode, displayName);
      writeLobbyToken(joinCode, joined.playerToken);
      router.push(`/lobby/${joinCode}`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not join that lobby.",
      );
      setBusy(null);
    }
  };

  return (
    <section className="container py-10 sm:py-14">
      <SectionHeading
        as="h1"
        align="center"
        eyebrow="Multiplayer"
        title="Play with friends"
        description="Everyone in a lobby gets the same five locations and guesses at the same time. Up to eight players."
      />

      <div className="mx-auto mt-8 max-w-md">
        <div className="surface-card rounded-2xl p-6 sm:p-7">
          <label
            htmlFor="lobby-name"
            className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
          >
            Your name
          </label>
          <Input
            id="lobby-name"
            value={displayName}
            onChange={(event) =>
              setDisplayName(sanitizeName(event.target.value))
            }
            placeholder="Guest"
            maxLength={10}
            className="mt-2"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Letters and numbers only, up to 10 characters. Leave it blank for a
            guest name.
          </p>

          <Button
            type="button"
            onClick={() => void handleCreate()}
            disabled={busy !== null}
            size="lg"
            className="mt-5 w-full rounded-xl shadow-glow"
          >
            <Plus className="size-4" />
            {busy === "create" ? "Creating lobby…" : "Create a lobby"}
          </Button>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              or join one
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <label
            htmlFor="lobby-code"
            className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
          >
            Lobby code
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input
              id="lobby-code"
              value={joinCode}
              onChange={(event) => setJoinCode(sanitizeCode(event.target.value))}
              placeholder="ABC234"
              maxLength={6}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="font-mono-accent tracking-[0.25em] sm:flex-1"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleJoin()}
              disabled={busy !== null}
              size="lg"
              className="rounded-xl sm:min-w-[120px]"
            >
              <LogIn className="size-4" />
              {busy === "join" ? "Joining…" : "Join"}
            </Button>
          </div>

          {errorMessage && (
            <p className="mt-4 text-sm font-medium text-destructive">
              {errorMessage}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
