import { ConvexHttpClient } from "convex/browser";
import { convexUrl } from "./config";

let client: ConvexHttpClient | null = null;

/** Shared server-side Convex client for route handlers. */
export function convex(): ConvexHttpClient {
  client ??= new ConvexHttpClient(convexUrl());
  return client;
}
