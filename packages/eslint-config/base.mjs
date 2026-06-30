import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import prettier from "eslint-config-prettier";
import onlyWarn from "eslint-plugin-only-warn";
import globals from "globals";

/**
 * Shared ESLint v9 flat config for TypeScript library packages.
 *
 * Mirrors the previous .eslintrc setup: eslint:recommended + typescript-eslint,
 * unused-vars as warnings (ignoring `_`-prefixed), prettier compatibility, and
 * `only-warn` so lint never fails a build on style issues.
 */
export const baseConfig = [
  {
    ignores: ["node_modules/**", "dist/**", ".next/**", "**/*.d.ts"],
  },
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.mjs"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "only-warn": onlyWarn,
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // tsc handles undefined symbols for typed code.
      "no-undef": "off",
    },
  },
  prettier,
];

export default baseConfig;
