import { baseConfig } from "@shipflow/eslint-config/base";

export default [
  ...baseConfig,
  { ignores: ["**/*.test.ts", "vitest.config.ts", "tsup.config.ts"] },
];
