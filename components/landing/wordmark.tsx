interface WordmarkProps {
  className?: string;
  /** Wrap each letter in a clip so the loader can rise them in. */
  animated?: boolean;
}

const LETTERS = "cadence".split("");

/** "cadence" in the display serif; the last two letters glow violet, like a pulse. */
export function Wordmark({ className = "", animated = false }: WordmarkProps) {
  return (
    <span className={`inline-flex font-display leading-none tracking-tight ${className}`} aria-label="Cadence">
      {LETTERS.map((ch, i) => (
        <span key={i} aria-hidden className={animated ? "inline-block overflow-hidden pb-[0.08em]" : undefined}>
          <span
            data-letter
            className={`inline-block ${i >= LETTERS.length - 2 ? "text-violet" : ""} ${
              i === 3 ? "italic" : ""
            }`}
          >
            {ch}
          </span>
        </span>
      ))}
    </span>
  );
}
