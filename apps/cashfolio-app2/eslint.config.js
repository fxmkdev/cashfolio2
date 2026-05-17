import js from "@eslint/js";
import tanstackRouter from "@tanstack/eslint-plugin-router";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "coverage/**",
      "dist/**",
      "node_modules/**",
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
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/rules-of-hooks": "error",
    },
  },
  {
    files: ["**/*.test.ts", "**/*.stories.tsx", ".storybook/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
