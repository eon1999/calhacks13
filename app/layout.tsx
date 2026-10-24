import type { Metadata } from "next";
import { Geist, Geist_Mono, IBM_Plex_Mono, Instrument_Serif } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import { ClerkIdentityBridge } from "@/components/auth/clerk-identity";
import { clerkEnabled } from "@/lib/clerk";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Cadence — Be there, even when you can't be",
  description:
    "Look after a loved one recovering at home after surgery. A voice wristband keeps them on track with doses and check-ins, and tells your family when something needs attention.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {clerkEnabled ? (
          <ClerkProvider appearance={{ theme: shadcn }}>
            <ClerkIdentityBridge>{children}</ClerkIdentityBridge>
          </ClerkProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
