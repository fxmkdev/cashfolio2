import js from "@eslint/js";
import tanstackRouter from "@tanstack/eslint-plugin-router";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";
import { fileURLToPath } from "node:url";
import noUiDependencies from "./eslint-rules/no-ui-dependencies.ts";
import moduleBoundaries from "./eslint-rules/module-boundaries.ts";

const sourceRoot = fileURLToPath(new URL("./src", import.meta.url));

export default tseslint.config(
  {
    ignores: [
      ".vitest/**",
      "coverage/**",
      "coverage-storybook/**",
      "dist/**",
      "node_modules/**",
      ".output/**",
      ".output-e2e/**",
      "playwright-report/**",
      "src/.prisma-client/**",
      "src/routeTree.gen.ts",
      "storybook-static/**",
      "test-results/**",
    ],
  },
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      "prefer-const": "off",
    },
  },
  ...tseslint.configs.recommended,
  ...tanstackRouter.configs["flat/recommended"],
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
          varsIgnorePattern: "^_",
        },
      ],
      "no-undef": "off",
      "no-unused-vars": "off",
      "prefer-const": "off",
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/rules-of-hooks": "error",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      cashfolio: {
        rules: {
          "no-ui-dependencies": noUiDependencies,
          "module-boundaries": moduleBoundaries,
        },
      },
    },
    rules: {
      "cashfolio/module-boundaries": [
        "error",
        {
          sourceRoot,
          // Explicit public RPC entry points; implementation helpers are private.
          serverFacades: [
            "account-books",
            "account-book-creation",
            "account-gain-loss",
            "account-returns",
            "accounts",
            "admin-users",
            "app-version",
            "asset-class-organize",
            "authentication",
            "classifications",
            "home",
            "ledger",
            "period",
            "period-end-net-worth",
            "period-gain-loss-reconciliation",
            "period-history",
            "period-opening-balance-net-worth",
            "statement-import",
            "transactions",
            "transactions-data",
            "user-deletion",
            "user-profile",
            "valuation-cache",
            "valuation-provider-usage",
          ],
        },
      ],
    },
  },
  {
    files: [
      "src/shared/**/*.{ts,tsx}",
      "src/server/**/*.{ts,tsx}",
      "src/**/*.server.{ts,tsx}",
    ],
    ignores: ["**/*.test.{ts,tsx}", "**/*.integration.{ts,tsx}"],
    rules: {
      "cashfolio/no-ui-dependencies": ["error", { sourceRoot }],
    },
  },
  {
    files: ["**/*.test.ts", "**/*.stories.tsx", ".storybook/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
