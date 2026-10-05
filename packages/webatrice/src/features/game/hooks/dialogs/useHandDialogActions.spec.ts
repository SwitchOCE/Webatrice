import { renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { I18nextProvider } from 'react-i18next';

import { testI18n } from '../../../../__test-utils__/renderWithProviders';
import { makeDialogTestEnv, makeDialogTestGame, makeSetterSpies } from '../../__test-utils__/dialogTestEnv';
import type { PromptState } from './gameDialogs.types';
import { useHandDialogActions } from './useHandDialogActions';

function setup({ hand = [7, 8, 9] } = {}) {
  const { env, webClient } = makeDialogTestEnv(makeDialogTestGame({ deckCount: 50, hand }));
  const set = makeSetterSpies();
  const { result } = renderHook(
    () => useHandDialogActions({ env, set }),
    { wrapper: ({ children }) => createElement(I18nextProvider, { i18n: testI18n }, children) },
  );
  const lastPrompt = () => set.setPrompt.mock.calls.at(-1)?.[0] as PromptState;
  return { result, set, webClient, lastPrompt };
}

describe('useHandDialogActions', () => {
  it('bounds the mulligan prompt by hand + library and resolves 0 and below against the hand size', () => {
    const { result, webClient, lastPrompt } = setup();

    result.current.handleRequestChooseMulligan();
    expect(lastPrompt()).toMatchObject({
      title: 'Draw hand',
      label: 'Number of cards',
      helperText: '0 and lower are in comparison to current hand size',
    });
    expect(lastPrompt().initialValue).toBe('7');
    expect(lastPrompt().validate?.('54')).toBe('Enter an integer between -3 and 53.');
    lastPrompt().onSubmit('-1');

    expect(webClient.request.game.mulligan).toHaveBeenCalledWith(1, { number: 2 });
  });

});
