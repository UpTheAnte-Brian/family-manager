import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Family Manager",
    short_name: "Family",
    description: "An iPad-first household console for family routines and daily coordination.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "landscape",
    background_color: "#f7f3ea",
    theme_color: "#f7f3ea",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
