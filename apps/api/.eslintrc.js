/* eslint-env node */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: "tsconfig.json",
    tsconfigRootDir: __dirname,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: ["plugin:@typescript-eslint/recommended", "prettier"],
  env: { node: true, jest: true },
  ignorePatterns: [".eslintrc.js", "dist", "coverage", "node_modules"],
  rules: {
    // `any` was previously disabled wholesale, which is how the implicit
    // `any`s accumulated. Warn rather than error so the build stays green
    // while the remaining cases stay visible.
    "@typescript-eslint/no-explicit-any": "warn",

    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/explicit-module-boundary-types": "off",

    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],

    // `require()` in a TypeScript file defeats type checking entirely.
    "@typescript-eslint/no-var-requires": "error",

    "no-console": ["warn", { allow: ["warn", "error"] }],
    eqeqeq: ["error", "smart"],
  },
  overrides: [
    {
      // Seeds and workers are CLI entrypoints; console output is the interface.
      files: ["prisma/**/*.ts", "src/workers/**/*.ts"],
      rules: { "no-console": "off" },
    },
  ],
};
