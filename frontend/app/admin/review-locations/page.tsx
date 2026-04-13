"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import { ReviewLocationPanorama } from "@/components/review-location-panorama";
import { ReviewLocationMap } from "@/components/review-location-map";
import { fetchLocationReviewQueue, updateLocationReviewStatus } from "@/lib/api";
import type {
  LocationReviewQueueResponse,
  LocationReviewStatus,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const TOKEN_STORAGE_KEY = "adminReviewToken";
const timestampFormatter = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "medium",
  timeStyle: "short",
});

function getStatusLabel(status: LocationReviewStatus) {
  if (status === "rejected") {
    return "Rejected";
  }

  if (status === "accepted") {
    return "Accepted";
  }

  return "Pending";
}

function getStatusBadgeClass(status: LocationReviewStatus) {
  if (status === "rejected") {
    return "border-red-200 bg-red-100 text-red-800 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-100";
  }

  if (status === "accepted") {
    return "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-100";
  }

  return "border-blue-200 bg-blue-100 text-blue-800 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-100";
}

export default function ReviewLocationsPage() {
  const [tokenInput, setTokenInput] = useState("");
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [queue, setQueue] = useState<LocationReviewQueueResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [lastAction, setLastAction] = useState<{
    locationId: string;
    index: number;
  } | null>(null);

  const currentEntry = queue?.entry ?? null;

  const loadQueue = async (index: number, token: string, locationId?: string) => {
    if (!token) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const nextQueue = await fetchLocationReviewQueue(index, token, locationId);
      setQueue(nextQueue);
    } catch (error) {
      setQueue(null);
      setErrorMessage(
        error instanceof Error ? error.message : "Could not load review queue."
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!storedToken) {
      return;
    }

    setTokenInput(storedToken);
    setAdminToken(storedToken);

    setIsLoading(true);
    setErrorMessage(null);

    void fetchLocationReviewQueue(0, storedToken)
      .then((nextQueue) => {
        setQueue(nextQueue);
      })
      .catch((error) => {
        setQueue(null);
        setErrorMessage(
          error instanceof Error ? error.message : "Could not load review queue."
        );
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const handleConnect = async () => {
    const nextToken = tokenInput.trim();

    if (!nextToken) {
      setAdminToken(null);
      setQueue(null);
      setErrorMessage("Enter an admin token to access the review queue.");
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
    setErrorMessage(null);
    setStatusMessage(null);
    setLastAction(null);
    setQueue(null);
    setAdminToken(nextToken);
    await loadQueue(0, nextToken);
  };

  const handleMove = async (direction: -1 | 1) => {
    if (!adminToken || !queue) {
      return;
    }

    const nextIndex = Math.max(0, queue.index + direction);
    await loadQueue(nextIndex, adminToken);
  };

  const handleDecision = async (action: "accept" | "reject") => {
    if (!adminToken || !currentEntry || !queue) {
      return;
    }

    setIsMutating(true);
    setErrorMessage(null);

    try {
      await updateLocationReviewStatus(currentEntry.id, action, adminToken);
      setLastAction({
        locationId: currentEntry.id,
        index: queue.index,
      });
      setStatusMessage(
        action === "accept"
          ? "Location accepted and removed from the review queue."
          : "Location rejected and removed from the review queue."
      );
      await loadQueue(queue.index, adminToken);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not update location."
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleUndo = async () => {
    if (!adminToken || !lastAction) {
      return;
    }

    setIsMutating(true);
    setErrorMessage(null);

    try {
      await updateLocationReviewStatus(lastAction.locationId, "undo", adminToken);
      setStatusMessage("Last review action was undone.");
      await loadQueue(lastAction.index, adminToken, lastAction.locationId);
      setLastAction(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not undo last action."
      );
    } finally {
      setIsMutating(false);
    }
  };

  return (
    <main className="flex flex-1 flex-col bg-background text-foreground dark:bg-[#001233] dark:text-white">
      <Header />
      <div className="container mx-auto flex flex-1 flex-col px-4 py-10">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.12em] text-primary">
              Admin Review
            </p>
            <h1 className="mt-2 text-3xl font-bold">Verified Location Review</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Review unverified Street View locations, accept the good ones, and
              mark bad indoor or unusable panoramas for deletion.
            </p>
          </div>
          <Card className="w-full max-w-md border-border/70 bg-card/90 shadow-sm dark:bg-gray-800">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Admin Access</CardTitle>
              <CardDescription>
                Enter the shared review token configured on the backend.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                type="password"
                value={tokenInput}
                onChange={(event) => setTokenInput(event.target.value)}
                placeholder="Admin review token"
              />
              <div className="flex gap-2">
                <Button type="button" onClick={() => void handleConnect()}>
                  Connect
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setTokenInput("");
                    setAdminToken(null);
                    setQueue(null);
                    setLastAction(null);
                    setStatusMessage(null);
                    setErrorMessage(null);
                    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
                  }}
                >
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mb-6 flex flex-wrap gap-3">
          <Badge variant="secondary">Pending Review: {queue?.total ?? 0}</Badge>
          <Badge className="border-red-200 bg-red-100 text-red-800 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-100">
            Rejected: {queue?.rejectedCount ?? 0}
          </Badge>
          {queue && queue.total > 0 && (
            <Badge variant="outline">
              Reviewing {queue.index + 1} of {queue.total}
            </Badge>
          )}
          {currentEntry && (
            <Badge className={getStatusBadgeClass(currentEntry.reviewStatus)}>
              {getStatusLabel(currentEntry.reviewStatus)}
            </Badge>
          )}
        </div>

        {(errorMessage || statusMessage) && (
          <div className="mb-6 space-y-2">
            {errorMessage && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-100">
                {errorMessage}
              </div>
            )}
            {statusMessage && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100">
                {statusMessage}
              </div>
            )}
          </div>
        )}

        {!adminToken && (
          <Card className="border-border/70 bg-card/90 dark:bg-gray-800">
            <CardContent className="p-6 text-sm text-muted-foreground">
              Connect with a valid admin token to load the review queue.
            </CardContent>
          </Card>
        )}

        {adminToken && isLoading && !queue && (
          <Card className="border-border/70 bg-card/90 dark:bg-gray-800">
            <CardContent className="p-6 text-sm text-muted-foreground">
              Loading review queue...
            </CardContent>
          </Card>
        )}

        {adminToken && !isLoading && queue && !currentEntry && (
          <Card className="border-border/70 bg-card/90 dark:bg-gray-800">
            <CardContent className="space-y-4 p-6">
              <p className="text-sm text-muted-foreground">
                No unverified locations are waiting for review.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!lastAction || isMutating}
                  onClick={() => void handleUndo()}
                >
                  Undo Last Action
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {adminToken && currentEntry && (
          <div>
            <div className="grid items-start gap-6 xl:grid-cols-[1.55fr,1fr]">
              <div className="space-y-4">
                <section className="self-start rounded-lg border border-border/70 bg-card/90 p-4 shadow-lg shadow-sky-950/5 backdrop-blur dark:bg-gray-800 dark:shadow-none">
                  <ReviewLocationPanorama
                    key={`panorama-${currentEntry.id}`}
                    panoId={currentEntry.panoId}
                    location={{
                      lat: currentEntry.lat,
                      lng: currentEntry.lng,
                    }}
                  />
                </section>

                <div className="flex flex-wrap justify-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!queue?.hasPrevious || isMutating || isLoading}
                    onClick={() => void handleMove(-1)}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={isMutating || isLoading}
                    onClick={() => void handleDecision("reject")}
                  >
                    Reject
                  </Button>
                  <Button
                    type="button"
                    disabled={isMutating || isLoading}
                    onClick={() => void handleDecision("accept")}
                  >
                    Accept
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!queue?.hasNext || isMutating || isLoading}
                    onClick={() => void handleMove(1)}
                  >
                    Next
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!lastAction || isMutating || isLoading}
                    onClick={() => void handleUndo()}
                  >
                    Undo Last Action
                  </Button>
                </div>
              </div>

              <div className="space-y-6">
                <section className="rounded-lg border border-border/70 bg-card/90 p-4 shadow-lg shadow-sky-950/5 backdrop-blur dark:bg-gray-800 dark:shadow-none">
                  <ReviewLocationMap
                    key={`map-${currentEntry.id}`}
                    location={{
                      lat: currentEntry.lat,
                      lng: currentEntry.lng,
                    }}
                  />
                </section>

                <Card className="border-border/70 bg-card/90 dark:bg-gray-800">
                  <CardHeader>
                    <CardTitle className="text-xl">Location Details</CardTitle>
                    <CardDescription>
                      Review metadata for the current queue item.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p>
                      <span className="font-medium">ID:</span> {currentEntry.id}
                    </p>
                    <p>
                      <span className="font-medium">Latitude:</span>{" "}
                      {currentEntry.lat.toFixed(6)}
                    </p>
                    <p>
                      <span className="font-medium">Longitude:</span>{" "}
                      {currentEntry.lng.toFixed(6)}
                    </p>
                    <p>
                      <span className="font-medium">Panorama:</span>{" "}
                      {currentEntry.panoId ?? "Missing"}
                    </p>
                    <p>
                      <span className="font-medium">Created:</span>{" "}
                      {currentEntry.createdAt
                        ? timestampFormatter.format(new Date(currentEntry.createdAt))
                        : "Unknown"}
                    </p>
                    <p>
                      <span className="font-medium">Updated:</span>{" "}
                      {currentEntry.updatedAt
                        ? timestampFormatter.format(new Date(currentEntry.updatedAt))
                        : "Unknown"}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
