import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import tailwindConfig from '../../tailwind.config';

// Vitest normally discards CSS. Follow the production entry's local imports (including the
// motion policy), then compile its actual Tailwind utilities. No network font import is needed.
function readStyles(file: string): string {
  const root = postcss.parse(fs.readFileSync(file, 'utf8'));
  root.walkAtRules('import', (rule) => {
    const local = rule.params.match(/^['"](\.[^'"]+)['"]$/);
    if (local) {
      rule.replaceWith(postcss.parse(readStyles(path.resolve(path.dirname(file), local[1]))));
    } else {
      rule.remove();
    }
  });
  return root.toString();
}

let compiled: Promise<string> | undefined;
export async function mountBoardStyles(): Promise<HTMLStyleElement> {
  compiled ??= postcss([tailwindcss(tailwindConfig)])
    .process(readStyles(path.resolve(__dirname, '../index.css')), { from: undefined })
    .then(({ root }) => {
      // Keep the compiled motion declarations. jsdom cannot evaluate the app's modern colour
      // functions; unrelated palette/layout declarations would prevent computed-style reads.
      root.walkDecls((decl) => {
        if (!/^(animation|transition|transform|--tw-(scale|translate|rotate|skew))/.test(decl.prop)) {
          decl.remove();
        }
      });
      return root.toString();
    });
  const style = document.createElement('style');
  // jsdom has no pointer-driven :hover state. Substitute only that pseudo-class so tests can
  // activate the real generated selector on a rendered element, without recreating its rules.
  style.textContent = (await compiled).replace(/:hover/g, '[data-test-hover]');
  document.head.appendChild(style);
  return style;
}
