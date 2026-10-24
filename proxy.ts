import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { clerkEnabled } from "./lib/clerk";

// Clerk session handling (Next.js 16 calls middleware "proxy"). A no-op until
// NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is set; no routes are forced behind sign-in
// yet, so the demo pages stay open.
export default clerkEnabled ? clerkMiddleware() : () => NextResponse.next();

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
