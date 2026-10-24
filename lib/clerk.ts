// Clerk sign-in is on when a publishable key is set (inlined at build time).
// Without one the app runs on per-browser demo identities, so teammates and
// the demo never need an account.
export const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
