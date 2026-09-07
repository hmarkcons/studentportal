import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // A useActionState action is always called as (prevState, formData), so
    // actions that need neither still have to declare them. Underscore already
    // marks them deliberate throughout this codebase — honour that rather than
    // reporting every one.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // These render to a PDF via @react-pdf/renderer, whose <Image> is not the
    // DOM img element and takes no alt prop — there is no assistive technology
    // reading this tree. jsx-a11y matches on the tag name alone.
    files: ["src/lib/pdf/**"],
    rules: { "jsx-a11y/alt-text": "off" },
  },
]);

export default eslintConfig;
