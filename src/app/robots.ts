import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const isProduction = process.env.VERCEL_ENV ? process.env.VERCEL_ENV === "production" : process.env.NODE_ENV === "production";
  if (!isProduction) {
    // Preview deployments must never be indexed.
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  const privatePaths = ["/account", "/checkout", "/cart", "/order", "/admin", "/track-order"];
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/auth/", ...privatePaths.flatMap((p) => [`/ar${p}`, `/en${p}`])],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
