// Clerk sign-in for Convex. Set CLERK_JWT_ISSUER_DOMAIN on the deployment
// (Clerk Dashboard → API keys → "Frontend API URL", e.g. https://xxx.clerk.accounts.dev)
// and create a JWT template named "convex" in Clerk. Without it, auth is off and
// functions fall back to the client-supplied demo identity (convex/identity.ts).
const domain = process.env.CLERK_JWT_ISSUER_DOMAIN;

export default {
  providers: domain ? [{ domain, applicationID: "convex" }] : [],
};
