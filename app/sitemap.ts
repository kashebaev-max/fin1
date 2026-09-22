import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/presentation", "/legal/terms", "/legal/privacy"].map(path => ({ url: `https://finstat.kz${path}` }));
}
