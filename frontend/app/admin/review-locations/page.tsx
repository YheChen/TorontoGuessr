"use client";

import { useEffect, useState } from "react";
import {
  ShieldCheck,
  Inbox,
  Trash2,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  MapPin,
  Hash,
} from "lucide-react";
import { ReviewLocationPanorama } from "@/components/review-location-panorama";
import { ReviewLocationMap } from "@/components/review-location-map";
import { fetchLocationReviewQueue, updateLocationReviewStatus } from "@/lib/api";
import type {
  LocationReviewQueueResponse,
  LocationReviewStatus,
} from "@/lib/types";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/site/spinner";
import { cn } from "@/lib/utils";

const TOKEN_STORAGE_KEY = "adminReviewToken";
const timestampFormatter = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "medium",
  timeStyle: "short",
});

function getStatusLabel(status: LocationReviewStatus) {
  if (status === "rejected") return "Rejected";
  if (status === "accepted") return "Accepted";
  return "Pending";
}

function getStatusVariant(status: LocationReviewStatus): BadgeProps["variant"] {
  if (status === "rejected") return "destructive";
  if (status === "accepted") return "success";
  return "info";
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

  const loadQueue = async (
    index: number,
    token: string,
    locationId?: string,
  ) => {
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
        error instanceof Error ? error.message : "Could not load review queue.",
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
          error instanceof Error
            ? error.message
            : "Could not load review queue.",
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
          : "Location rejected and removed from the review queue.",
      );
      await loadQueue(queue.index, adminToken);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not update location.",
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
      await updateLocationReviewStatus(
        lastAction.locationId,
        "undo",
        adminToken,
      );
      setStatusMessage("Last review action was undone.");
      await loadQueue(lastAction.index, adminToken, lastAction.locationId);
      setLastAction(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not undo last action.",
      );
    } finally {
      setIsMutating(false);
    }
  };

  const tiles = [
    {
      label: "In queue",
      value: queue?.total ?? 0,
      icon: Inbox,
      tone: "bg-accent text-primary",
    },
    {
      label: "Rejected",
      value: queue?.rejectedCount ?? 0,
      icon: Trash2,
      tone: "bg-destructive/12 text-destructive",
    },
    {
      label: "Position",
      value:
        queue && currentEntry
          ? `${queue.index + 1} / ${queue.total}`
          : "-",
      icon: Hash,
      tone: "bg-secondary text-secondary-foreground",
    },
  ] as const;

  return (
    <section className="container py-10 sm:py-12">
      {/* Header + access */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            <ShieldCheck className="size-3.5" />
            Admin
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Location review
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-muted-foreground">
            Review unverified Street View locations, accept the good ones, and
            flag indoor or unusable panoramas for removal.
          </p>
        </div>

        <div className="surface-card w-full max-w-md rounded-2xl p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">Admin access</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Enter the shared review token configured on the backend.
          </p>
          <Input
            type="password"
            value={tokenInput}
            onChange={(event) => setTokenInput(event.target.value)}
            placeholder="Admin review token"
            aria-label="Admin review token"
            className="mt-3"
          />
          <div className="mt-3 flex gap-2">
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
        </div>
      </div>

      {/* Stat tiles */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="surface-card rounded-2xl p-5">
            <span
              className={cn(
                "grid size-9 place-items-center rounded-lg",
                tile.tone,
              )}
            >
              <tile.icon className="size-5" />
            </span>
            <p className="mt-3 text-2xl font-bold tabular">{tile.value}</p>
            <p className="text-sm text-muted-foreground">{tile.label}</p>
          </div>
        ))}
      </div>

      {/* Messages */}
      {(errorMessage || statusMessage) && (
        <div className="mt-6 space-y-2">
          {errorMessage && (
            <div
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
            >
              {errorMessage}
            </div>
          )}
          {statusMessage && (
            <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm font-medium text-success">
              {statusMessage}
            </div>
          )}
        </div>
      )}

      {/* Body */}
      <div className="mt-6">
        {!adminToken && (
          <div className="surface-card rounded-2xl p-8 text-center text-sm text-muted-foreground">
            Connect with a valid admin token to load the review queue.
          </div>
        )}

        {adminToken && isLoading && !queue && (
          <div className="surface-card flex items-center justify-center gap-3 rounded-2xl py-16 text-sm text-muted-foreground">
            <Spinner size={26} />
            Loading review queue…
          </div>
        )}

        {adminToken && !isLoading && queue && !currentEntry && (
          <div className="surface-card flex flex-col items-center gap-4 rounded-2xl px-8 py-14 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-success/12 text-success ring-1 ring-inset ring-success/25">
              <Check className="size-6" />
            </span>
            <div>
              <p className="text-base font-semibold">Queue is clear</p>
              <p className="mt-1 text-sm text-muted-foreground">
                No unverified locations are waiting for review.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!lastAction || isMutating}
              onClick={() => void handleUndo()}
            >
              <RotateCcw className="size-4" />
              Undo last action
            </Button>
          </div>
        )}

        {adminToken && currentEntry && (
          <div className="grid items-start gap-6 xl:grid-cols-[1.55fr_1fr]">
            {/* Panorama + actions */}
            <div className="space-y-4">
              <div className="surface-card flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
                <Badge variant={getStatusVariant(currentEntry.reviewStatus)}>
                  {getStatusLabel(currentEntry.reviewStatus)}
                </Badge>
                <span className="font-mono-accent text-xs text-muted-foreground">
                  {currentEntry.id}
                </span>
              </div>

              <div className="surface-card rounded-2xl p-2.5">
                <ReviewLocationPanorama
                  key={`panorama-${currentEntry.id}`}
                  panoId={currentEntry.panoId}
                  location={{
                    lat: currentEntry.lat,
                    lng: currentEntry.lng,
                  }}
                />
              </div>

              {/* Action toolbar */}
              <div className="glass-strong sticky bottom-4 z-10 rounded-2xl p-3 shadow-elevated">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={isMutating || isLoading}
                    onClick={() => void handleDecision("reject")}
                    className="col-span-1"
                  >
                    <X className="size-4" />
                    Reject
                  </Button>
                  <Button
                    type="button"
                    variant="success"
                    disabled={isMutating || isLoading}
                    onClick={() => void handleDecision("accept")}
                    className="col-span-1"
                  >
                    <Check className="size-4" />
                    Accept
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!queue?.hasPrevious || isMutating || isLoading}
                    onClick={() => void handleMove(-1)}
                  >
                    <ChevronLeft className="size-4" />
                    Prev
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!queue?.hasNext || isMutating || isLoading}
                    onClick={() => void handleMove(1)}
                  >
                    Next
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
                <div className="mt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!lastAction || isMutating || isLoading}
                    onClick={() => void handleUndo()}
                    className="w-full"
                  >
                    <RotateCcw className="size-4" />
                    Undo last action
                  </Button>
                </div>
              </div>
            </div>

            {/* Map + details */}
            <div className="space-y-4">
              <div className="surface-card rounded-2xl p-2.5">
                <ReviewLocationMap
                  key={`map-${currentEntry.id}`}
                  location={{
                    lat: currentEntry.lat,
                    lng: currentEntry.lng,
                  }}
                />
              </div>

              <div className="surface-card rounded-2xl p-6">
                <div className="flex items-center gap-2">
                  <MapPin className="size-4 text-primary" />
                  <h3 className="text-base font-semibold">Location details</h3>
                </div>
                <dl className="mt-4 space-y-3 text-sm">
                  <DetailRow label="Latitude" value={currentEntry.lat.toFixed(6)} mono />
                  <DetailRow label="Longitude" value={currentEntry.lng.toFixed(6)} mono />
                  <DetailRow
                    label="Panorama"
                    value={currentEntry.panoId ?? "Missing"}
                    mono
                  />
                  <DetailRow
                    label="Created"
                    value={
                      currentEntry.createdAt
                        ? timestampFormatter.format(
                            new Date(currentEntry.createdAt),
                          )
                        : "Unknown"
                    }
                  />
                  <DetailRow
                    label="Updated"
                    value={
                      currentEntry.updatedAt
                        ? timestampFormatter.format(
                            new Date(currentEntry.updatedAt),
                          )
                        : "Unknown"
                    }
                  />
                </dl>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/50 pb-3 last:border-0 last:pb-0">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "min-w-0 truncate text-right font-medium",
          mono && "font-mono-accent text-xs",
        )}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}
