// Clerk sign-in for Convex: tokens issued by the team's Clerk app (its
// Frontend API URL, which is public). Clerk also needs its Convex integration
// turned on (a JWT template named "convex"). Signed-out callers still fall
// back to demo identities (convex/identity.ts).
// Don't read process.env here: Convex refuses to deploy if a referenced
// variable isn't set on the deployment, even with a fallback.
export default {
  providers: [{ domain: "https://perfect-ewe-2767.clerk.accounts.dev", applicationID: "convex" }],
};
