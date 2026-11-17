import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', '.gmp_cache/**/*'],
  },
  firebaseRulesPlugin.configs['flat/recommended'],
];
