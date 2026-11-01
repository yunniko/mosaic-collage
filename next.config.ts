import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** A static export: the app has no backend (D003, D005), so `out/` is the whole site. */
const nextConfig: NextConfig = {
  output: "export",
  devIndicators: false,
  poweredByHeader: false,
  images: { unoptimized: true },
};

export default withNextIntl(nextConfig);
