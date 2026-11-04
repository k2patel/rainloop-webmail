import js from '@eslint/js';
import globals from 'globals';
import babelParser from '@babel/eslint-parser';
export default [{
 files: ['dev/**/*.js'],
 linterOptions: { reportUnusedDisableDirectives: false },
 languageOptions: {
  parser: babelParser,
  parserOptions: {
   requireConfigFile: false,
   babelOptions: { plugins: [['@babel/plugin-proposal-decorators', { version: 'legacy' }]] }
  },
  globals: { ...globals.browser, ...globals.node, RL_ES6: 'readonly' }
 },
 rules: { ...js.configs.recommended.rules, 'no-useless-assignment': 'off', /* Preserve legacy default-initializer style. */
 'no-unused-vars': ['error', { caughtErrors: 'none', args: 'none' }] }
}];
