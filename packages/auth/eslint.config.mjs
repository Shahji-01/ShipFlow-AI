import { baseConfig } from "@shipflow/eslint-config/base";

export default [
  ...baseConfig,
  { ignores: ["**/*.test.ts", "tsup.config.ts"] },
];
