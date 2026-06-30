import { nextConfig } from "@shipflow/eslint-config/next";

export default [
  ...nextConfig,
  { ignores: [".next/**", "next-env.d.ts"] },
];
