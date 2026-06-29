/**
 * Fixed, non-interactive ambience layer behind the whole app:
 * a base wash, a cartographic grid, a soft azure spotlight, and two color
 * blooms. The Toronto skyline lives in the footer (see FooterBackdrop).
 */
export function TorontoBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* base vertical wash */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-secondary/40" />

      {/* cartographic grid, masked to fade toward the edges */}
      <div
        className="absolute inset-0 bg-map-grid opacity-[0.55] dark:opacity-30"
        style={{
          maskImage:
            "radial-gradient(ellipse 90% 70% at 50% 30%, black, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 90% 70% at 50% 30%, black, transparent 80%)",
        }}
      />

      {/* top spotlight */}
      <div className="absolute inset-x-0 top-0 h-[520px] bg-spotlight" />

      {/* color blooms */}
      <div className="absolute -left-24 top-24 h-72 w-72 rounded-full bg-toronto-azure/15 blur-3xl dark:bg-toronto-azure/20" />
      <div className="absolute -right-20 top-1/3 h-80 w-80 rounded-full bg-toronto-red/10 blur-3xl dark:bg-toronto-red/10" />
    </div>
  );
}
