"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Wordmark } from "@/components/landing/wordmark";

// Form primitives for onboarding, in the landing page's lilac/plum language:
// display-serif headlines, mono labels, glass pill buttons.

export function OnboardingShell({ aside, children, label = "Setup" }: { aside?: ReactNode; children: ReactNode; label?: string }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-lilac text-plum">
      {/* soft dusk clouds, echoing the landing sky */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-[10%] -top-[10%] h-[50vh] w-[55vw] rounded-full bg-[#e3c9fb]/70 blur-[90px]" />
        <div className="absolute -right-[8%] top-[30%] h-[45vh] w-[40vw] rounded-full bg-[#f6d3f3]/60 blur-[90px]" />
        <div className="absolute bottom-[-20%] left-[25%] h-[40vh] w-[50vw] rounded-full bg-[#c9b0f5]/40 blur-[100px]" />
      </div>

      <header className="relative flex items-center justify-between px-5 py-5 md:px-10">
        <Link href="/" aria-label="Cadence home" className="text-3xl">
          <Wordmark />
        </Link>
        <span className="mono-label text-plum-muted">{label}</span>
      </header>

      <div className="relative mx-auto grid max-w-6xl gap-10 px-5 pb-24 md:grid-cols-[220px_1fr] md:px-10 md:pt-6">
        {aside ? <aside>{aside}</aside> : <div />}
        <main>{children}</main>
      </div>
    </div>
  );
}

export interface RailStep {
  id: string;
  label: string;
}

/** "[01] You" style index of the steps, like the landing's right-edge index. */
export function StepRail({ steps, current, done }: { steps: RailStep[]; current: string; done: (id: string) => boolean }) {
  return (
    <ol className="flex gap-4 overflow-x-auto md:sticky md:top-8 md:flex-col md:gap-2">
      {steps.map((s, i) => {
        const active = s.id === current;
        return (
          <li key={s.id} aria-current={active ? "step" : undefined} className="flex shrink-0 items-baseline gap-3">
            <span className={`mono-label ${active ? "text-violet" : "text-plum-muted"}`}>
              [{String(i + 1).padStart(2, "0")}]
            </span>
            <span
              className={`mono-label transition-colors ${active ? "text-plum" : done(s.id) ? "text-plum/70" : "text-plum-muted/70"}`}
            >
              {s.label}
              {done(s.id) && !active ? " ✓" : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function StepHeading({ kicker, children, sub }: { kicker: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-10">
      <span className="tag-pill">▸ {kicker}</span>
      <h1 className="display mt-5 text-[clamp(2.6rem,6.5vw,5.5rem)]">{children}</h1>
      {sub && <p className="mt-5 max-w-[52ch] text-base text-plum-muted">{sub}</p>}
    </div>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="mono-label block text-plum-muted">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-plum-muted">{hint}</p>}
    </div>
  );
}

const control =
  "w-full rounded-2xl border border-plum/15 bg-white/60 px-4 text-base text-plum placeholder:text-plum-muted/60 backdrop-blur-sm transition-colors outline-none focus:border-violet focus:bg-white/80 focus-visible:ring-2 focus-visible:ring-violet/30 disabled:opacity-50";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${control} h-12 ${props.className ?? ""}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${control} min-h-24 py-3 ${props.className ?? ""}`} />;
}

/** A native dropdown with our own chevron (the browser's is hidden by `appearance-none`). */
export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={`relative ${className}`}>
      <select {...props} className={`${control} h-12 cursor-pointer appearance-none pr-11`} />
      <ChevronDown aria-hidden className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-plum-muted" />
    </div>
  );
}

export function Toggle({ checked, onChange, label, body }: { checked: boolean; onChange: (v: boolean) => void; label: string; body: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-4 rounded-2xl border border-plum/10 bg-white/40 px-4 py-3 text-left outline-none transition-colors hover:bg-white/60 focus-visible:ring-2 focus-visible:ring-violet/40"
    >
      <span
        aria-hidden
        className={`mt-1 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${checked ? "bg-violet" : "bg-plum/20"}`}
      >
        <span className={`size-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
      </span>
      <span>
        <span className="block font-medium">{label}</span>
        <span className="block text-sm text-plum-muted">{body}</span>
      </span>
    </button>
  );
}

export function PrimaryButton({ children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`glass-pill glass-pill-dark group inline-flex h-12 items-center gap-3 px-6 text-sm font-medium text-white transition-transform duration-300 hover:scale-[1.03] disabled:pointer-events-none disabled:opacity-50 ${className}`}
    >
      {children}
      <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">
        →
      </span>
    </button>
  );
}

export function SecondaryButton({ children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`glass-pill inline-flex h-11 items-center gap-2 px-5 text-sm font-medium text-plum transition-transform duration-300 hover:scale-[1.03] disabled:pointer-events-none disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function TextButton({ children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`mono-label rounded-full px-3 py-2 text-plum-muted transition-colors hover:text-violet disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

/** Back / skip / continue row at the bottom of each step. */
export function StepActions({ children }: { children: ReactNode }) {
  return <div className="mt-12 flex flex-wrap items-center gap-3 border-t border-plum/10 pt-8">{children}</div>;
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-2xl border border-destructive/30 bg-white/70 px-4 py-3 text-sm text-destructive">
      {message}
    </p>
  );
}

export function errorText(error: unknown): string {
  if (!(error instanceof Error)) return "Something went wrong. Try again.";
  // Convex wraps thrown messages: "[CONVEX M(...)] Uncaught Error: <message> at handler ..."
  const match = error.message.match(/Uncaught Error: (.+?)(?:\s+at |\n|$)/);
  return match?.[1] ?? error.message;
}
