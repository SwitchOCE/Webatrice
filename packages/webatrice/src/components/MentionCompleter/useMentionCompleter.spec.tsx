import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';

import { getSettings, settingsStore } from '../../hooks/useSettings';
import { useMentionCompleter } from './useMentionCompleter';

const onSubmit = vi.fn();

function ChatInput({ names }: { names: readonly string[] }) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const mention = useMentionCompleter({ names, value, onValueChange: setValue, inputRef });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
      }}
    >
      <div className="relative">
        <input ref={inputRef} aria-label="chat" value={value} {...mention.inputProps} />
        {mention.popup}
      </div>
    </form>
  );
}

const NAMES = ['Alice', 'albert', 'Bob'];

function type(value: string) {
  fireEvent.change(screen.getByLabelText('chat'), { target: { value } });
}

function press(key: string, init: KeyboardEventInit = {}) {
  fireEvent.keyDown(screen.getByLabelText('chat'), { key, ...init });
}

describe('useMentionCompleter', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    settingsStore.reset();
    await getSettings();
  });

  it('is a collapsed combobox until an @ is typed', () => {
    render(<ChatInput names={NAMES} />);

    const input = screen.getByRole('combobox', { name: 'chat' });
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('lists the names the typed prefix starts, first one active', () => {
    render(<ChatInput names={NAMES} />);

    type('hi @al');

    const input = screen.getByRole('combobox');
    const listbox = screen.getByRole('listbox', { name: 'MentionCompleter.label' });
    const options = screen.getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['@Alice', '@albert']);
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', listbox.id);
    expect(input).toHaveAttribute('aria-activedescendant', options[0].id);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('moves through the suggestions with the arrow keys, wrapping', () => {
    render(<ChatInput names={NAMES} />);
    type('@');

    press('ArrowDown');
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    press('ArrowUp');
    press('ArrowUp');
    expect(screen.getAllByRole('option')[2]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[2].id);
  });

  it('inserts the active name with Enter, without sending the message', () => {
    render(<ChatInput names={NAMES} />);
    type('hi @al');

    press('ArrowDown');
    press('Enter');

    expect(screen.getByRole('combobox')).toHaveValue('hi @albert ');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('inserts the active name with Tab and keeps the caret after it', () => {
    render(<ChatInput names={NAMES} />);
    type('@b');

    press('Tab');

    const input = screen.getByRole('combobox') as HTMLInputElement;
    expect(input).toHaveValue('@Bob ');
    expect(input.selectionStart).toBe(5);
  });

  it('leaves Shift+Tab to move focus', () => {
    render(<ChatInput names={NAMES} />);
    type('@b');

    press('Tab', { shiftKey: true });

    expect(screen.getByRole('combobox')).toHaveValue('@b');
  });

  it('closes with Escape without the key reaching the page', () => {
    const onPageKey = vi.fn();
    document.addEventListener('keydown', onPageKey);
    render(<ChatInput names={NAMES} />);
    type('@a');

    press('Escape');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('@a');
    expect(onPageKey).not.toHaveBeenCalled();
    document.removeEventListener('keydown', onPageKey);
  });

  it('sends with Enter when nothing matches', () => {
    render(<ChatInput names={NAMES} />);
    type('@zed');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.submit(screen.getByRole('combobox'));
    expect(onSubmit).toHaveBeenCalledWith('@zed');
  });

  it('inserts a clicked name', () => {
    render(<ChatInput names={NAMES} />);
    type('@a');

    fireEvent.click(screen.getByRole('option', { name: '@albert' }));

    expect(screen.getByRole('combobox')).toHaveValue('@albert ');
  });

  it('closes when the input loses focus', () => {
    render(<ChatInput names={NAMES} />);
    type('@a');

    fireEvent.blur(screen.getByRole('combobox'));

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('leaves the input a plain text box while the setting is off', async () => {
    await act(async () => {
      const settings = await getSettings();
      settings.chatMentionCompleter = false;
      settingsStore.setValue(settings);
    });
    render(<ChatInput names={NAMES} />);

    type('@a');

    expect(screen.getByRole('textbox', { name: 'chat' })).toHaveValue('@a');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
