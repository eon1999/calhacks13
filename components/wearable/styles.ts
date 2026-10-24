// Shared classes so the simulator's cards read like setup: mono labels, lilac glass fields.

// Spelled out (not .mono-label) so it beats CardTitle's own font and size utilities via tailwind-merge.
export const cardTitle =
  "flex items-center gap-2 font-plex text-[11px] leading-tight font-medium tracking-[0.02em] text-plum-muted uppercase";

export const sectionLabel = "mono-label text-plum-muted";

export const field =
  "min-w-0 rounded-xl border border-plum/15 bg-white/60 px-3 text-sm text-plum outline-none transition-colors placeholder:text-plum-muted/60 focus:border-violet focus:bg-white/80 disabled:opacity-50";
