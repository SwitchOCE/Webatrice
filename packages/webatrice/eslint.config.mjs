import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import { boundariesConfig } from './eslint.boundaries.mjs';

export default tseslint.config(
  // Global ignores
  { ignores: ['node_modules/**', 'build/**'] },

  // Base JS recommended
  js.configs.recommended,

  // TypeScript recommended (sets up parser + plugin)
  ...tseslint.configs.recommended,

  // Hooks correctness. Only the two classic rules: the React Compiler rule set in
  // `recommended` targets compiler adoption, which this codebase has not opted into.
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // Enforce module boundaries
  ...boundariesConfig,

  // External boundary: UI/store/feature code must not value-import the
  // WebClient class — runtime access is via `useWebClient()` from
  // `@cockatrice/datatrice/react`. Type-only
  // `import type { WebClient } from '@cockatrice/sockatrice'` is allowed
  // everywhere. Other Sockatrice exports are unrestricted. Integration
  // tests are exempt. Datatrice's WebClientProvider is the sole
  // construction site, and it lives outside this repo.
  {
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        paths: [{
          name: '@cockatrice/sockatrice',
          importNames: ['WebClient'],
          message: 'UI/store/feature code must use useWebClient() from `@cockatrice/datatrice/react` for runtime WebClient access. For type-only references, use `import type { WebClient } from "@cockatrice/sockatrice"`.',
          allowTypeImports: true,
        }],
      }],
    },
  },
  { files: ['integration/**'], rules: { '@typescript-eslint/no-restricted-imports': 'off' } },

  // E2E specs run against real browsers, so their network must be isolated:
  // `e2e/fixtures/test.ts` routes every context it hands out. Importing
  // Playwright's own `test`, or opening a context straight off `browser`,
  // would skip that and let a spec reach the internet.
  {
    files: ['e2e/specs/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        paths: [{
          name: '@playwright/test',
          importNames: ['test'],
          message: 'Import `test` from e2e/fixtures/test.ts, which isolates the network of every browser context.',
        }],
      }],
      'no-restricted-properties': ['error', {
        object: 'browser',
        property: 'newContext',
        message: 'Use the `newContext` fixture from e2e/fixtures/test.ts, which isolates the network of the context.',
      }],
    },
  },
  // Playwright fixtures receive a `use` callback, which is not React's `use`.
  { files: ['e2e/**'], rules: { 'react-hooks/rules-of-hooks': 'off' } },
  // Owners extracted from the PlayerBox seat must not depend back on it: the
  // façade may import them, never the reverse (docs/webatrice-solid-refactor-plan.md §6).
  {
    files: [
      'src/features/game/components/battlefield/Battlefield/{battlefieldLayout,cardPlacement}.ts',
      'src/features/game/components/context-menus/CardContextMenu/{cardAttributeEdits,cardContextMenu.model,relatedCardActions}.ts',
      'src/features/game/components/context-menus/CardContextMenu/CardContextMenu.tsx',
      'src/features/game/components/context-menus/useViewportClampedMenu.ts',
      'src/features/game/components/right-sidebar/PlayerInfoPanel/lifeExpression.ts',
      'src/features/game/components/ui/{CardPreviewContext,GameSelectionContext,SeatDragContext,SeatShortcutsContext}.tsx',
      'src/features/game/components/ui/PlayerBoard/playerBoard.types.ts',
      'src/features/game/components/ui/GameBoardCell/use{PlayerSeatViewModel,Player*Commands,OpenDeckInEditor,MoveCard}.ts',
      'src/features/game/dialogs/ZoneViewDialog/*.{ts,tsx}',
      'src/features/game/dialogs/IncomingRevealDialog/IncomingRevealDialog.tsx',
      'src/features/game/components/ui/SeatCard/{SeatCard.tsx,cardSize.ts}',
      'src/features/game/hooks/{useSeatSelection,seatDropPlan,gamePointerSensor}.ts',
    ],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['**/PlayerBox/**'], message: 'Seat owners must not import the PlayerBox façade.' }],
      }],
    },
  },

  // Project-specific config
  {
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.es2020,
      },
    },
    rules: {
      // TypeScript overrides
      '@typescript-eslint/no-unused-vars': ['warn', { varsIgnorePattern: '^_', argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',

      // Disable new rules not in original config
      'prefer-const': 'off',
      'no-extra-boolean-cast': 'off',
      'no-case-declarations': 'off',
      'preserve-caught-error': 'off',

      // Spacing / formatting
      'array-bracket-spacing': ['error', 'never'],
      'arrow-spacing': ['error', { before: true, after: true }],
      'block-spacing': ['error', 'always'],
      'brace-style': ['error', '1tbs', { allowSingleLine: false }],
      'comma-spacing': ['error', { before: false, after: true }],
      'comma-style': ['error', 'last'],
      'computed-property-spacing': ['error', 'never'],
      'curly': ['error', 'all'],
      'dot-location': ['error', 'property'],
      'eol-last': ['error'],
      'func-names': ['warn'],
      'indent': ['error', 2, { SwitchCase: 1 }],
      'key-spacing': ['error', { beforeColon: false, afterColon: true }],
      'keyword-spacing': ['error'],
      'linebreak-style': ['error', process.platform === 'win32' ? 'windows' : 'unix'],
      'max-len': ['error', { code: 140 }],
      'no-eq-null': ['off'],
      'no-func-assign': ['error'],
      'no-mixed-spaces-and-tabs': ['error'],
      'no-multi-spaces': ['error'],
      'no-trailing-spaces': ['error'],
      'no-var': ['error'],
      'object-curly-spacing': ['error', 'always'],
      'one-var': ['error', 'never'],
      'one-var-declaration-per-line': ['error'],
      'quotes': ['error', 'single'],
      'semi-spacing': ['error', { before: false, after: true }],
      'space-before-blocks': ['error'],
      'space-before-function-paren': ['error', { asyncArrow: 'always', anonymous: 'never', named: 'never' }],
      'space-in-parens': ['error', 'never'],
      'space-infix-ops': ['error'],
      'space-unary-ops': ['error', { words: true, nonwords: false }],
    },
  },
);
