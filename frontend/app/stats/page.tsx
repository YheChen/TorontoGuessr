import type { Metadata } from "next";
import { StatsClient } from "./stats-client";

export const metadata: Metadata = {
  title: "Stats",
  description:
    "Live gameplay statistics for TorontoGuessr: games started and finished per day, completion rate, and activity trends.",
};

export default function StatsPage() {
  return <StatsClient />;
}
