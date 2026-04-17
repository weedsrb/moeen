import type { NextConfig } from "next";
import createBundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = createBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  // cacheComponents requires Suspense boundaries on every route with dynamic
  // data access — that work lands in Phase 3 alongside per-route loading.tsx.
  // Re-enable there.
  experimental: {
    staleTimes: { dynamic: 30, static: 300 },
    optimizePackageImports: ["lucide-react", "@base-ui/react", "framer-motion"],
  },
  images: {
    remotePatterns: supabaseHost
      ? [
          {
            protocol: "https",
            hostname: supabaseHost,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
};

export default withBundleAnalyzer(nextConfig);
