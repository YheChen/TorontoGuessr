import type { Metadata } from "next";
import { LobbyEntry } from "./lobby-entry";

export const metadata: Metadata = {
  title: "Multiplayer",
  description:
    "Create a private TorontoGuessr lobby or join a friend with a code, then race through the same five Toronto locations together.",
};

export default function LobbyPage() {
  return <LobbyEntry />;
}
