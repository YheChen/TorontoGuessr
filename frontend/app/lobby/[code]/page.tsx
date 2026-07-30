import { LobbyRoom } from "./lobby-room";

export const metadata = {
  title: "Lobby",
  // A lobby is a private, transient room; there is nothing to index.
  robots: { index: false, follow: false },
};

export default async function LobbyCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <LobbyRoom joinCode={code.toUpperCase()} />;
}
