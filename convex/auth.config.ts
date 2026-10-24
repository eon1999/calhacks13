// Clerk sign-in for Convex. The issuer is the Clerk app's Frontend API URL
// (public, not a secret); CLERK_JWT_ISSUER_DOMAIN on the deployment overrides it.
// Clerk also needs its Convex integration turned on (a JWT template named
// "convex"). Signed-out callers still fall back to demo identities
// (convex/identity.ts).
const domain = process.env.CLERK_JWT_ISSUER_DOMAIN ?? "https://perfect-ewe-2767.clerk.accounts.dev";

export default {
  providers: [{ domain, applicationID: "convex" }],
};
