/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent from "../agent.js";
import type * as debug from "../debug.js";
import type * as http from "../http.js";
import type * as invites from "../invites.js";
import type * as notify from "../notify.js";
import type * as onboarding from "../onboarding.js";
import type * as pairing from "../pairing.js";
import type * as profile from "../profile.js";
import type * as seed from "../seed.js";
import type * as voice from "../voice.js";
import type * as watchList from "../watchList.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agent: typeof agent;
  debug: typeof debug;
  http: typeof http;
  invites: typeof invites;
  notify: typeof notify;
  onboarding: typeof onboarding;
  pairing: typeof pairing;
  profile: typeof profile;
  seed: typeof seed;
  voice: typeof voice;
  watchList: typeof watchList;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
