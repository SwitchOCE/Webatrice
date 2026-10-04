import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, file), 'utf8');

// board-motion.css first: the feature stylesheets load after index.css, so its rules must win on
// specificity, not order. SeatCard's transition is a Tailwind utility, stood in for here.
const css = [
  read('board-motion.css'),
  read('card-flip.css'),
  read('../features/game/Game.css'),
  read('../features/game/components/ui/CardSlot/CardSlot.css'),
  '.seat-card { transition: transform 150ms ease-out; }',
].join('\n');

/** One element per animated class the board draws, under the real stylesheets. */
function mountBoard(): Record<string, HTMLElement> {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  const elements: Record<string, HTMLElement> = {};
  for (const className of [
    'card-slot', 'seat-card', 'cardflip--animate-to-front', 'cardflip--animate-to-back', 'phase-endstep-flash',
  ]) {
    elements[className] = document.createElement('div');
    elements[className].className = className;
    document.body.appendChild(elements[className]);
  }
  return elements;
}

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  delete document.documentElement.dataset.animations;
});

describe('board-motion.css', () => {
  it('stops the slot and hover transitions, the card flip and the phase flash when the policy is off', () => {
    const elements = mountBoard();
    document.documentElement.dataset.animations = 'off';
    expect(getComputedStyle(elements['card-slot']).transition).toBe('none');
    expect(getComputedStyle(elements['seat-card']).transition).toBe('none');
    expect(getComputedStyle(elements['cardflip--animate-to-front']).animation).toBe('none');
    expect(getComputedStyle(elements['cardflip--animate-to-back']).animation).toBe('none');
    expect(getComputedStyle(elements['phase-endstep-flash']).animation).toBe('none');
  });

  it('leaves them alone when the policy is on, whatever the system setting', () => {
    const elements = mountBoard();
    document.documentElement.dataset.animations = 'on';
    expect(getComputedStyle(elements['card-slot']).transition).not.toBe('none');
    expect(getComputedStyle(elements['cardflip--animate-to-front']).animation).toContain('cardflip-to-front');
    expect(getComputedStyle(elements['phase-endstep-flash']).animation).toContain('phase-endstep-flash');
  });
});
