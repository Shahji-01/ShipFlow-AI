import type { NextConfig } from "next";
import path from "path";

/** Security headers applied to all responses. */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  // Pin the workspace root so Next.js doesn't mis-detect it from a stray
  // lockfile in a parent directory (fixes the multi-lockfile warning and
  // ensures correct file tracing on Vercel).
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // Force-include the Prisma query engine binary in the serverless function
  // bundle. In a pnpm monorepo, Next's file tracer doesn't copy the engine
  // (`libquery_engine-*.so.node`) next to the bundle, causing a runtime
  // PrismaClientInitializationError ("Query Engine ... could not be located").
  outputFileTracingIncludes: {
    "/**/*": [
      "../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/*.node",
      "../../node_modules/.prisma/client/*.node",
    ],
  },
  // Don't leak the framework version header.
  poweredByHeader: false,
  transpilePackages: [
    "@shipflow/ui",
    "@shipflow/api",
    "@shipflow/auth",
    "@shipflow/database",
    "@shipflow/inngest",
    "remotion",
    "@remotion/player",
    "@remotion/core",
  ],
  // @sentry/node is an optional peer dependency, imported lazily and guarded
  // with a .catch() in the logger (a runtime no-op when absent). It lives inside
  // the transpiled @shipflow/api bundle, so ignore it at the webpack level to
  // keep the production build warning-free without bundling/resolving it.
  webpack: (config, { webpack }) => {
    config.plugins.push(
      new webpack.IgnorePlugin({ resourceRegExp: /^@sentry\/node$/ })
    );
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
