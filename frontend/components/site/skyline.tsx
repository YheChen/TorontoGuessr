import { cn } from "@/lib/utils";

/**
 * Stylized Toronto skyline silhouette (CN Tower + downtown cluster).
 * Fills with currentColor so callers can tint and fade it freely.
 */
export function Skyline({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1200 230"
      preserveAspectRatio="xMidYMax slice"
      fill="currentColor"
      className={cn("block w-full", className)}
      aria-hidden="true"
    >
      {/* left low-rise cluster */}
      <rect x="0" y="170" width="60" height="60" />
      <rect x="64" y="150" width="44" height="80" />
      <rect x="112" y="178" width="36" height="52" />
      <rect x="150" y="138" width="52" height="92" />
      <rect x="206" y="160" width="40" height="70" />
      <rect x="250" y="120" width="58" height="110" />
      <rect x="312" y="150" width="34" height="80" />

      {/* mid-rise approach */}
      <rect x="352" y="108" width="56" height="122" />
      <rect x="414" y="134" width="40" height="96" />
      <rect x="458" y="92" width="62" height="138" />
      <rect x="524" y="120" width="36" height="110" />

      {/* CN Tower */}
      <g>
        <rect x="606" y="6" width="6" height="34" rx="3" />
        <path d="M603 96c0-9 3-14 6-14s6 5 6 14v134h-12V96Z" />
        <path d="M598 96c0-7 5-12 11-12s11 5 11 12-5 11-11 11-11-4-11-11Z" />
        <rect x="600" y="40" width="18" height="56" rx="2" />
      </g>

      {/* downtown towers right of CN Tower */}
      <rect x="640" y="86" width="54" height="144" />
      <rect x="700" y="58" width="46" height="172" />
      <rect x="752" y="100" width="40" height="130" />
      <rect x="796" y="44" width="58" height="186" />
      <rect x="860" y="120" width="36" height="110" />
      <rect x="902" y="80" width="50" height="150" />
      <rect x="958" y="140" width="42" height="90" />
      <rect x="1006" y="104" width="56" height="126" />
      <rect x="1068" y="160" width="38" height="70" />
      <rect x="1112" y="132" width="48" height="98" />
      <rect x="1164" y="176" width="36" height="54" />
    </svg>
  );
}
