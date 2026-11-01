import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "next-env.d.ts", "playwright-report/**", "test-results/**", "public/**"]),
  // lib/ is the framework-free layer: pure modules the unit tests run without a browser (STANDARDS.md -> Software).
  {
    files: ["lib/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "react", message: "lib/ stays framework-free." },
            { name: "react-dom", message: "lib/ stays framework-free." },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
