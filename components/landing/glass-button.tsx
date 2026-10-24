import Link from "next/link";
import type { ReactNode } from "react";

interface GlassButtonProps {
  href: string;
  children: ReactNode;
  className?: string;
}

/** Pill CTA with the gradient hairline; the → nudges on hover. */
export function GlassButton({ href, children, className = "" }: GlassButtonProps) {
  return (
    <Link
      href={href}
      className={`glass-pill group inline-flex h-11 items-center gap-3 px-5 text-sm font-medium text-plum transition-transform duration-300 hover:scale-[1.03] ${className}`}
    >
      {children}
      <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">
        →
      </span>
    </Link>
  );
}
