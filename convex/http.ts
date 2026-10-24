import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const http = httpRouter();

// TODO: verify `Authorization: Bearer <device token>` against devices.tokenHash.
const notImplemented = httpAction(async () =>
  Response.json({ error: "not implemented" }, { status: 501 }),
);

http.route({ path: "/device/activity", method: "POST", handler: notImplemented });
http.route({ path: "/device/event", method: "POST", handler: notImplemented });
http.route({ path: "/device/heartbeat", method: "POST", handler: notImplemented });

export default http;
