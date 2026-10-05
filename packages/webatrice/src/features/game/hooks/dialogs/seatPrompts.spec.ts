import {
  annotationPrompt,
  cardCounterPrompt,
  expressionPrompt,
  libraryCountPrompt,
  moveXFromTopPrompt,
  powerToughnessPrompt,
} from './seatPrompts';
import { catalogT } from '../../__test-utils__/catalogT';
import editTokens from '../../../../feature-widgets/card-import/EditTokens.i18n.json';
import moveTopUntil from '../../dialogs/MoveTopUntilDialog/MoveTopUntilDialog.i18n.json';
import gamePrompt from './GamePrompt.i18n.json';
import menus from '../../components/context-menus/menus.i18n.json';

const t = catalogT(gamePrompt, editTokens, moveTopUntil, menus);

describe('expressionPrompt', () => {
  it('seeds the current value and submits the evaluated sum', () => {
    const onSubmit = vi.fn();
    const prompt = expressionPrompt(t, { current: 20, onSubmit });

    expect(prompt).toMatchObject({ title: 'Set life total', label: 'Life total', initialValue: '20', submitLabel: 'Save' });
    prompt.onSubmit('20+5*2');
    expect(onSubmit).toHaveBeenCalledWith(30);
  });

  it('previews arithmetic but not a plain number, and rejects what does not evaluate', () => {
    const prompt = expressionPrompt(t, { current: 40, onSubmit: vi.fn() });

    expect(prompt.preview?.('40+10')).toBe('= 50');
    expect(prompt.preview?.('40')).toBeNull();
    expect(prompt.preview?.('40+')).toBeNull();
    expect(prompt.validate?.('-3')).toBeNull();
    expect(prompt.validate?.('abc')).toBe('Enter a number or a sum like 40+10');
    expect(prompt.validate?.('')).toBe('Enter a number or a sum like 40+10');
  });

  it('takes a counter title, label and description', () => {
    const prompt = expressionPrompt(t, {
      current: 2,
      onSubmit: vi.fn(),
      title: 'Set white counter',
      label: 'White',
      description: 'Current: 2',
    });
    expect(prompt).toMatchObject({ title: 'Set white counter', label: 'White', description: 'Current: 2' });
  });
});

describe('card text prompts', () => {
  it('prefills P/T and annotation with the card name as the description, blank allowed', () => {
    const onSubmit = vi.fn();
    const pt = powerToughnessPrompt(t, { cardName: 'Bear', current: '2/2', onSubmit });
    const note = annotationPrompt(t, { cardName: 'Bear', current: '', onSubmit });

    expect(pt).toMatchObject({
      title: 'Change power/toughness',
      label: 'Change stats to',
      description: 'Bear',
      initialValue: '2/2',
    });
    expect(note).toMatchObject({
      title: 'Set annotation',
      label: 'Please enter the new annotation',
      description: 'Bear',
      placeholder: 'Leave blank to clear',
    });
    expect(pt.validate).toBeUndefined();
    note.onSubmit('');
    expect(onSubmit).toHaveBeenCalledWith('');
  });
});

describe('cardCounterPrompt', () => {
  it('accepts 0 or more and submits the number', () => {
    const onSubmit = vi.fn();
    const prompt = cardCounterPrompt(t, { cardName: 'Bear', counterLetter: 'B', current: 3, onSubmit });

    expect(prompt).toMatchObject({ title: 'Set counter B', initialValue: '3', submitLabel: 'Set' });
    expect(prompt.validate?.('0')).toBeNull();
    expect(prompt.validate?.('-1')).toBe('Enter 0 or more');
    expect(prompt.validate?.('x')).toBe('Enter 0 or more');
    prompt.onSubmit('7');
    expect(onSubmit).toHaveBeenCalledWith(7);
  });
});

describe('libraryCountPrompt', () => {
  it('requires 1 or more and clamps to the library', () => {
    const onSubmit = vi.fn();
    const prompt = libraryCountPrompt(t, { title: 'Draw cards', submitLabel: 'Draw', deckSize: 5, initial: 1, onSubmit });

    expect(prompt).toMatchObject({ description: 'Library size: 5', initialValue: '1', submitLabel: 'Draw' });
    expect(prompt.validate?.('0')).toBe('Enter 1 or more');
    expect(prompt.validate?.('9')).toBeNull();
    prompt.onSubmit('9');
    expect(onSubmit).toHaveBeenCalledWith(5);
  });

  it('refuses any count when the library is empty', () => {
    const prompt = libraryCountPrompt(t, { title: 'T', submitLabel: 'View', deckSize: 0, initial: 1, onSubmit: vi.fn() });
    expect(prompt.validate?.('1')).toBe('The library is empty');
  });
});

describe('moveXFromTopPrompt', () => {
  it('takes a position from 0 and clamps it to the library size', () => {
    const onSubmit = vi.fn();
    const prompt = moveXFromTopPrompt(t, { cardName: 'Bear', deckSize: 4, initial: 3, onSubmit });

    expect(prompt).toMatchObject({
      title: 'Place card X cards from top of library',
      label: 'Place at position (0 = top, 4 = bottom)',
      initialValue: '3',
      submitLabel: 'Move',
    });
    expect(prompt.validate?.('0')).toBeNull();
    expect(prompt.validate?.('-1')).toBe('Enter 0 or more');
    prompt.onSubmit('10');
    expect(onSubmit).toHaveBeenCalledWith(4);
  });
});
