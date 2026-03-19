module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true
  },
  extends: ["eslint:recommended"],
  parserOptions: {
    ecmaVersion: "latest"
  },
  rules: {
    "max-len": ["warn", { code: 120, ignoreStrings: true, ignoreTemplateLiterals: true }],
    "no-console": "off"
  }
};
