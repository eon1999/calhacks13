import type { HeadlineLine } from "./content";

interface HeadlineProps {
  lines: HeadlineLine[];
  className?: string;
  as?: "h1" | "h2";
}

/** Display headline: uppercase serif lines with italic lead-ins. */
export function Headline({ lines, className = "", as: Tag = "h2" }: HeadlineProps) {
  return (
    <Tag data-split className={`display ${className}`}>
      {lines.map((line, i) => (
        <span key={i} className="block">
          {line.em && <em>{line.em}</em>}
          {line.em && line.text && " "}
          {line.text}
          {line.emAfter && (
            <>
              {" "}
              <em>{line.emAfter}</em>
            </>
          )}
        </span>
      ))}
    </Tag>
  );
}
