import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import * as espree from 'espree';
import reactHooks from 'eslint-plugin-react-hooks';
import i18next from 'eslint-plugin-i18next';
import { boundariesConfig } from './eslint.boundaries.mjs';

// Block direct forwarding barrels anywhere in the package, including aliases
// and namespace exports. Built-in rules do not follow local bindings: importing
// a hook outside the seam and then exporting that binding (or a wrapper around
// it) still needs review. Computed module names and aliased require calls are
// likewise not resolved. These rules do not inspect passed-in client instances.
const webClientReexports = [
  {
    selector: 'ExportNamedDeclaration[source.value="@cockatrice/datatrice/react"][exportKind!="type"] > ExportSpecifier[exportKind!="type"][local.name=/^(useWebClient|WebClientContext)$/]',
    message: 'Do not forward WebClient access through a barrel; game code must use command ports.',
  },
  {
    selector: 'ExportAllDeclaration[source.value="@cockatrice/datatrice/react"][exportKind!="type"]',
    message: 'Do not forward WebClient access through a barrel; game code must use command ports.',
  },
];

const WEB_CLIENT_IMPORT = {
  name: '@cockatrice/sockatrice',
  importNames: ['WebClient'],
  message: 'UI/store/feature code must use useWebClient() from `@cockatrice/datatrice/react` for runtime WebClient access. For type-only references, use `import type { WebClient } from "@cockatrice/sockatrice"`.',
  allowTypeImports: true,
};

const MUI_ROOT_IMPORTS = [{
  name: '@mui/material',
  message: 'Import each component from its own path (`@mui/material/Button`); the root loads all of MUI into every spec.',
  allowTypeImports: true,
}, {
  name: '@mui/icons-material',
  message: 'Import each icon from its own path (`@mui/icons-material/Close`); the root loads all icons into every spec.',
  allowTypeImports: true,
}];

const SCRYFALL_CLIENT_IMPORT = {
  group: ['**/scryfall/client'],
  message: 'The raw Scryfall client bypasses the card catalog\'s cache, session memo and retry cap. '
    + 'Look cards up through the catalog (`lookupCard`, `lookupCards`, …) and build image URLs '
    + 'with the `getScryfallUrl*` builders from `@app/services`.',
};

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
  //
  // Internal boundary: only the card catalog and the two deck modules that
  // batch their own collection requests (pricing, bracket sources) may use
  // the raw Scryfall client in services/scryfall/client.ts.
  //
  // The MUI package roots are restricted for load cost: each unit test
  // file gets a fresh module graph, so one root import anywhere under a
  // barrel loads all of MUI in every spec that reaches that barrel.
  {
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        paths: [WEB_CLIENT_IMPORT, ...MUI_ROOT_IMPORTS],
        patterns: [SCRYFALL_CLIENT_IMPORT],
      }],
    },
  },
  {
    files: ['src/services/cards/catalog/**', 'src/features/decks/pricing.ts', 'src/features/decks/bracketSources.ts'],
    rules: { '@typescript-eslint/no-restricted-imports': ['error', { paths: [WEB_CLIENT_IMPORT, ...MUI_ROOT_IMPORTS] }] },
  },
  { files: ['integration/**'], rules: { '@typescript-eslint/no-restricted-imports': 'off' } },
  { rules: { 'no-restricted-syntax': ['error', ...webClientReexports] } },

  // Game layering: the game's components and hooks reach the server through
  // its command ports (components/ui/GameBoardCell: the seat's
  // usePlayer*Commands, useTargetCommandsFor, useCardPlayCommands, useMoveCard,
  // useGameSay), never through useWebClient. The ports are listed by name;
  // the files after them predate the rule and still call the WebClient
  // directly; each is to move behind a port (the stack-A card menus with its
  // deletion), so the list only shrinks. The rules check module access only:
  // hooks/dialogs/* and hooks/playCard.ts still drive request.game.* on an
  // instance handed in by the allowlisted useGameDialogs, debt that leaves
  // with it. This block replaces the WebClient value-import rule above for
  // these files, so it repeats it.
  {
    files: ['src/features/game/components/**', 'src/features/game/hooks/**'],
    ignores: [
      'src/features/game/components/ui/GameBoardCell/use*Commands.ts',
      'src/features/game/components/ui/GameBoardCell/useMoveCard.ts',
      'src/features/game/components/ui/GameBoardCell/useGameSay.ts',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      'src/features/game/components/ChatLog/useGameLog.ts',
      'src/features/game/components/PhaseTrack/usePhaseBar.ts',
      'src/features/game/components/arrows/GameArrowOverlay/useGameArrowOverlay.ts',
      'src/features/game/components/context-menus/CardContextMenu/useCardContextMenu.ts',
      'src/features/game/components/context-menus/HandContextMenu/useHandContextMenu.ts',
      'src/features/game/components/context-menus/ZoneContextMenu/useZoneContextMenu.ts',
      'src/features/game/components/lobby/useLobbyDeckView.ts',
      'src/features/game/components/right-sidebar/PlayerList/PlayerList.tsx',
      'src/features/game/hooks/useGameDialogs.ts',
      'src/features/game/hooks/useGameDnd.ts',
      'src/features/game/hooks/useGameInvite.ts',
      'src/features/game/hooks/useGameShortcuts.ts',
      'src/features/game/hooks/usePlaymatSync.ts',
    ],
    rules: {
      'no-restricted-syntax': ['error', ...webClientReexports, ...[
        '@cockatrice/datatrice/react', '@cockatrice/sockatrice',
      ].flatMap((source) => [
        {
          selector: `ImportExpression[source.value="${source}"]`,
          message: 'Game components and hooks must use command ports, not dynamic WebClient imports.',
        },
        {
          selector: `CallExpression[callee.name="require"][arguments.0.value="${source}"]`,
          message: 'Game components and hooks must use command ports, not require WebClient entry points.',
        },
      ])],
      '@typescript-eslint/no-restricted-imports': ['error', {
        paths: [
          {
            name: '@cockatrice/sockatrice',
            importNames: ['WebClient'],
            message: 'UI/store/feature code must use useWebClient() from `@cockatrice/datatrice/react` for runtime WebClient access. For type-only references, use `import type { WebClient } from "@cockatrice/sockatrice"`.',
            allowTypeImports: true,
          },
          {
            name: '@cockatrice/datatrice/react',
            importNames: ['useWebClient', 'WebClientContext'],
            message: 'Game components and hooks send commands through the game\'s command ports (components/ui/GameBoardCell), not the WebClient.',
          },
        ],
      }],
    },
  },

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

  // UI text goes through i18next (`t()` / `<Trans>`): no English literals in JSX
  // text or in the attributes users read. `scripts/check-i18n.mjs` checks the keys.
  {
    files: ['src/**/*.tsx'],
    ignores: ['src/**/*.spec.tsx', 'src/__test-utils__/**', 'src/**/__mocks__/**'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': ['error', {
        mode: 'jsx-only',
        // The plugin full-matches these, so `.*[lL]abel` covers `label`, `aria-label` and props like `submitLabel`.
        'jsx-attributes': {
          include: [
            'title',
            'aria-(label|description|roledescription|valuetext|placeholder)',
            'placeholder',
            '.*[lL]abel',
            'helperText',
            'alt',
            'message',
          ],
        },
        // File paths and other technical text shown in <code>.
        'jsx-components': { exclude: ['Trans', 'code'] },
        // Technical helpers whose string arguments are action IDs or internal zone names.
        callees: {
          exclude: [
            'i18n(ext)?',
            't',
            'require',
            'addEventListener',
            'removeEventListener',
            'postMessage',
            'getElementById',
            'dispatch',
            'commit',
            'includes',
            'indexOf',
            'endsWith',
            'startsWith',
            'menuShortcut',
            'isDragging',
            'tags\\.push',
          ],
        },
        // These properties carry discriminators, layout values or wire destinations, not text.
        'object-properties': { exclude: ['[A-Z_-]+', 'kind', 'type', 'zone', 'index', 'placement', 'align'] },
        // No letters (separators, arrows, dashes), and brand names.
        words: { exclude: ['[^a-zA-Z]+', 'COCKATRICE', 'Webatrice', 'TCGplayer'] },
        'should-validate-template': true,
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

  // Build and CI scripts run under Node.
  {
    files: ['scripts/**'],
    languageOptions: { globals: { ...globals.node } },
  },

  // The capability preflight runs as a classic script before the bundle, in
  // browsers too old to parse it, so it must stay ES5: espree at ecmaVersion 5
  // rejects any newer syntax as a parse error.
  {
    files: ['public/preflight.js'],
    languageOptions: {
      parser: espree,
      ecmaVersion: 5,
      sourceType: 'script',
      parserOptions: { ecmaFeatures: { jsx: false } },
      globals: { ...globals.browser },
    },
    rules: {
      'no-var': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { caughtErrors: 'none' }],
    },
  },
);
