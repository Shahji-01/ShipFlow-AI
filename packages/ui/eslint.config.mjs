import { baseConfig } from "@shipflow/eslint-config/base";

export default [...baseConfig, { ignores: ["tsup.config.ts"] }];
