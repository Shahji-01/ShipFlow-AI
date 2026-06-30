import nextPlugin from "@next/eslint-plugin-next";
import globals from "globals";
import { baseConfig } from "./base.mjs";

/**
 * Shared ESLint v9 flat config for the Next.js app.
 *
 * Extends the base library config with browser globals and the official Next
 * plugin's recommended + core-web-vitals rules.
 */
export const nextConfig = [
  ...baseConfig,
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.jsx"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
];

export default nextConfig;
