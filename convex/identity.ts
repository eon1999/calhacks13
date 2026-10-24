import type { QueryCtx } from "./_generated/server";

// Who is calling. With Clerk configured (convex/auth.config.ts) a signed-in
// caller is identified by their Clerk user id and can't claim to be anyone
// else. Signed-out callers fall back to the client's demo identity so the
// hackathon demo works without an account, unless CADENCE_REQUIRE_AUTH=1 is
// set on the deployment.

export async function resolveUserId(ctx: QueryCtx, claimed: string): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity) return identity.subject;
  if (process.env.CADENCE_REQUIRE_AUTH === "1") throw new Error("Please sign in first");
  return claimed;
}

/** Like resolveUserId, for queries that may be called before anyone is known. */
export async function resolveOptionalUserId(ctx: QueryCtx, claimed: string | undefined): Promise<string | undefined> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity) return identity.subject;
  return claimed;
}
