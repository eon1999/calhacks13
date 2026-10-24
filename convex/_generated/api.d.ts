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
import type * as ai from "../ai.js";
import type * as alerts from "../alerts.js";
import type * as crons from "../crons.js";
import type * as debug from "../debug.js";
import type * as demo from "../demo.js";
import type * as devices from "../devices.js";
import type * as doses from "../doses.js";
import type * as http from "../http.js";
import type * as identity from "../identity.js";
import type * as invites from "../invites.js";
import type * as notify from "../notify.js";
import type * as onboarding from "../onboarding.js";
import type * as pairing from "../pairing.js";
import type * as phone from "../phone.js";
import type * as profile from "../profile.js";
import type * as reports from "../reports.js";
import type * as safety from "../safety.js";
import type * as seed from "../seed.js";
import type * as settings from "../settings.js";
import type * as summary from "../summary.js";
import type * as voice from "../voice.js";
import type * as watchList from "../watchList.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agent: typeof agent;
  ai: typeof ai;
  alerts: typeof alerts;
  crons: typeof crons;
  debug: typeof debug;
  demo: typeof demo;
  devices: typeof devices;
  doses: typeof doses;
  http: typeof http;
  identity: typeof identity;
  invites: typeof invites;
  notify: typeof notify;
  onboarding: typeof onboarding;
  pairing: typeof pairing;
  phone: typeof phone;
  profile: typeof profile;
  reports: typeof reports;
  safety: typeof safety;
  seed: typeof seed;
  settings: typeof settings;
  summary: typeof summary;
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
