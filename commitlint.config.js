/** @type {import('@commitlint/types').UserConfig} */
const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Allowed types
    "type-enum": [
      2,
      "always",
      [
        "feat",     // new feature
        "fix",      // bug fix
        "chore",    // maintenance, dependencies, config
        "docs",     // documentation only
        "refactor", // code change that neither fixes a bug nor adds a feature
        "style",    // formatting, missing semicolons, etc.
        "perf",     // performance improvement
        "revert",   // revert a previous commit
      ],
    ],
    // Scope is optional but if provided must be lowercase
    "scope-case": [2, "always", "lower-case"],
    // Subject line rules
    "subject-case": [2, "always", "lower-case"],
    "subject-empty": [2, "never"],
    "subject-full-stop": [2, "never", "."],
    "subject-max-length": [2, "always", 72],
    // Body rules
    "body-max-line-length": [2, "always", 100],
  },
};

module.exports = config;
