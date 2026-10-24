import type { MetadataRoute } from "next";

// Makes Cadence installable ("Add to Home Screen"). It opens on the hub, the
// phone's stand-in for the band, in the judge-facing view.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/hub",
    name: "Cadence",
    short_name: "Cadence",
    description: "Doses, check-ins and alerts for a loved one recovering at home after surgery.",
    start_url: "/hub?demo=1",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#4a12a3",
    theme_color: "#4a12a3",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // The icon is full-bleed with the mark inside the safe zone, so it doubles as maskable.
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
