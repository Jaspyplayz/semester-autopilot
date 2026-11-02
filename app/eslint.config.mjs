import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const SERVER_BOUNDARY =
  "Crosses the server boundary: this code can end up in the browser, so it can't touch tokens, keys or LLM code. Move what the client needs to a plain module, or name this file *.server.ts.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Everything but route handlers, *.server files and tests. Allowing only those
    // also stops a plain module carrying server code to a client component.
    name: "server-boundary",
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/app/api/**/route.ts", "src/**/*.server.{ts,tsx}", "src/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/*.server", "**/*.server.*", "**/api/**/route", "**/api/**/route.*", "@anthropic-ai/sdk", "@anthropic-ai/sdk/**"],
              message: SERVER_BOUNDARY,
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: "ImportExpression[source.value=/\\.server(\\.|$)|\\/api\\/.*\\/route(\\.|$)|^@anthropic-ai\\/sdk/]", message: SERVER_BOUNDARY },
        { selector: "MemberExpression[object.name='process'][property.name='env']", message: SERVER_BOUNDARY },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
