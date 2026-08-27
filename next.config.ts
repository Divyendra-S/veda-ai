import type { NextConfig } from "next";

/**
 * Page images are served from private Supabase Storage through signed URLs, so
 * the host is whitelisted here. They are still rendered with `unoptimized`:
 * the optimizer would resample the bitmap the model was shown, and every
 * highlight on the review screen is positioned against that bitmap.
 */
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHost
      ? [
          {
            protocol: "https",
            hostname: supabaseHost,
            pathname: "/storage/v1/object/sign/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
