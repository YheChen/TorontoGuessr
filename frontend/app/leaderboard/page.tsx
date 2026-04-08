"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import { fetchLeaderboard } from "@/lib/api";
import type { LeaderboardEntry } from "@/lib/types";

export default function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadLeaderboard = async () => {
      try {
        const nextEntries = await fetchLeaderboard();
        setEntries(nextEntries);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Could not load leaderboard data.";
        setErrorMessage(message);
      } finally {
        setIsLoading(false);
      }
    };

    void loadLeaderboard();
  }, []);

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground dark:bg-gray-900 light:bg-gray-100">
      <Header />
      <div className="container mx-auto p-6">
        <h1 className="mb-6 text-2xl font-bold dark:text-white light:text-[#00205B]">
          Leaderboard
        </h1>
        <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800 light:border-2 light:border-[#001233] light:bg-[#00205B] light:text-white">
          {isLoading && (
            <p className="my-8 text-center text-gray-500 dark:text-gray-400 light:text-gray-300">
              Loading scores...
            </p>
          )}

          {!isLoading && errorMessage && (
            <p className="my-8 text-center text-red-500">{errorMessage}</p>
          )}

          {!isLoading && !errorMessage && entries.length === 0 && (
            <p className="my-8 text-center text-gray-500 dark:text-gray-400 light:text-gray-300">
              No completed games yet. Finish a game to create the first entry.
            </p>
          )}

          {!isLoading && !errorMessage && entries.length > 0 && (
            <div className="space-y-3">
              {entries.map((entry, index) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between border-b pb-3"
                >
                  <div>
                    <p className="font-medium">#{index + 1}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 light:text-gray-300">
                      Completed {new Date(entry.completedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{entry.totalScore} points</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 light:text-gray-300">
                      {entry.roundsPlayed} rounds
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
