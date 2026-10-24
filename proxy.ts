import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { clerkEnabled } from "./lib/clerk";

// Clerk session handling (Next.js 16 calls middleware "proxy"). A no-op until
// both Clerk keys are set (without the secret key clerkMiddleware would fail
// every request); no routes are forced behind sign-in yet, so the demo stays open.
const serverKeys = clerkEnabled && Boolean(process.env.CLERK_SECRET_KEY);
export default serverKeys ? clerkMiddleware() : () => NextResponse.next();

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
