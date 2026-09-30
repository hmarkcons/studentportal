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
    // Every page here is a server render behind a sign-in, and a <Link>
    // prefetches its target the moment it scrolls into view — so a dashboard
    // with a dozen links quietly rendered a dozen pages nobody opened, each one
    // the proxy's auth check and a layout's worth of queries. The loading.tsx
    // skeletons give the instant feedback on click instead. Say prefetch on
    // every Link, so one that should prefetch does so on purpose.
    files: ["src/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name='Link']:not(:has(JSXAttribute[name.name='prefetch']))",
          message: "Give this <Link> prefetch={false} (or prefetch on purpose): see eslint.config.mjs.",
        },
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
