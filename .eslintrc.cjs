/* ESLint configuration */
module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true
  },
  extends: [
    'standard'
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': 'off'
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'playwright-report/'
  ]
};
