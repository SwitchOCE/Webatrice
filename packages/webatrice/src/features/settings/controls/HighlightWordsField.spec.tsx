import { act, fireEvent, render, screen } from '@testing-library/react';

import { getPreferencesSnapshot, getSettings, settingsStore } from '../../../hooks/useSettings';
import HighlightWordsField from './HighlightWordsField';

describe('HighlightWordsField', () => {
  beforeEach(async () => {
    settingsStore.reset();
    await getSettings();
  });

  it('saves valid words as they are typed', async () => {
    render(<HighlightWordsField id="w" labelId="w-label" disabled={false} />);

    await act(async () => {
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'commander edh' } });
    });

    expect(getPreferencesSnapshot().chatHighlightWords).toBe('commander edh');
  });

  it('explains and does not save words with punctuation', async () => {
    render(<HighlightWordsField id="w" labelId="w-label" disabled={false} />);

    await act(async () => {
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'gg!' } });
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('SettingsChat.highlightWords.invalid');
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
    expect(getPreferencesSnapshot().chatHighlightWords).toBe('');
  });

  it('follows a change made elsewhere, such as Restore defaults', async () => {
    render(<HighlightWordsField id="w" labelId="w-label" disabled={false} />);

    await act(async () => {
      const settings = await getSettings();
      settings.chatHighlightWords = 'modern';
      settingsStore.setValue(settings);
    });

    expect(screen.getByRole('textbox')).toHaveValue('modern');
  });
});
