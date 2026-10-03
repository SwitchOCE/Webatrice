import { act, fireEvent, screen, within } from '@testing-library/react';

import { DEFAULT_PLAYMAT_SETTINGS, getPlaymatSettings, setPlaymatSettings } from '@app/hooks';
import { renderWithProviders } from '../../../__test-utils__';

import PlaymatSettingsPanel from './PlaymatSettingsPanel';

const PARAMS = { marginPctL: 0.07, marginPctR: 0.07, verticalOffset: 0.33, zoom: 1 };
const mat = (cardName: string) => ({ cardName, cardProviderId: '', params: PARAMS });
const names = () => getPlaymatSettings().fallbackList.map((entry) => entry.cardName);

function chooseOption(label: string, option: string) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: label }));
  fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: option }));
}

describe('PlaymatSettingsPanel', () => {
  afterEach(() => {
    act(() => setPlaymatSettings(DEFAULT_PLAYMAT_SETTINGS));
  });

  it('shows desktop\'s defaults', () => {
    renderWithProviders(<PlaymatSettingsPanel />);

    expect(screen.getByRole('combobox', { name: 'PlaymatSettings.visibility.label' }))
      .toHaveTextContent('PlaymatSettings.visibility.all');
    expect(screen.getByRole('combobox', { name: 'PlaymatSettings.mode.label' }))
      .toHaveTextContent('PlaymatSettings.mode.fallback');
    expect(screen.getByRole('combobox', { name: 'PlaymatSettings.collection.listMode' }))
      .toHaveTextContent('PlaymatSettings.collection.fixed');
    expect(screen.getByText('PlaymatSettings.collection.empty')).toBeInTheDocument();
  });

  it('saves each choice as soon as it is made', () => {
    renderWithProviders(<PlaymatSettingsPanel />);

    chooseOption('PlaymatSettings.visibility.label', 'PlaymatSettings.visibility.ownOnly');
    chooseOption('PlaymatSettings.mode.label', 'PlaymatSettings.mode.overrideDeck');
    chooseOption('PlaymatSettings.collection.listMode', 'PlaymatSettings.collection.random');

    expect(getPlaymatSettings()).toMatchObject({ visibility: 1, mode: 0, fallbackBehavior: 2 });
  });

  it('adds a card to the collection and opens its crop editor', async () => {
    renderWithProviders(<PlaymatSettingsPanel />);

    fireEvent.change(screen.getByRole('textbox', { name: 'PlaymatSettings.collection.cardName' }), {
      target: { value: '  Island ' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'PlaymatSettings.collection.add' }));
    });

    expect(getPlaymatSettings().fallbackList).toEqual([mat('Island')]);
    expect(screen.getByRole('group', { name: 'PlaymatSettings.crop.title' })).toBeInTheDocument();
  });

  it('requires a card name', async () => {
    renderWithProviders(<PlaymatSettingsPanel />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'PlaymatSettings.collection.add' }));
    });

    expect(screen.getByText('Common.validation.required')).toBeInTheDocument();
    expect(getPlaymatSettings().fallbackList).toEqual([]);
  });

  it('reorders and removes entries', () => {
    act(() => setPlaymatSettings({ fallbackList: [mat('A'), mat('B'), mat('C')] }));
    renderWithProviders(<PlaymatSettingsPanel />);

    const rows = () => screen.getAllByRole('listitem');
    expect(within(rows()[0]).getByRole('button', { name: 'PlaymatSettings.collection.moveUp' })).toBeDisabled();
    expect(within(rows()[2]).getByRole('button', { name: 'PlaymatSettings.collection.moveDown' })).toBeDisabled();

    fireEvent.click(within(rows()[2]).getByRole('button', { name: 'PlaymatSettings.collection.moveUp' }));
    expect(names()).toEqual(['A', 'C', 'B']);

    fireEvent.click(within(rows()[0]).getByRole('button', { name: 'PlaymatSettings.collection.moveDown' }));
    expect(names()).toEqual(['C', 'A', 'B']);

    fireEvent.click(within(rows()[1]).getByRole('button', { name: 'PlaymatSettings.collection.remove' }));
    expect(names()).toEqual(['C', 'B']);
  });

  it('edits an entry\'s crop', () => {
    act(() => setPlaymatSettings({ fallbackList: [mat('A')] }));
    renderWithProviders(<PlaymatSettingsPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'PlaymatSettings.collection.edit' }));
    fireEvent.change(screen.getByRole('slider', { name: 'PlaymatSettings.crop.zoom' }), { target: { value: 2.5 } });

    expect(getPlaymatSettings().fallbackList[0].params).toEqual({ ...PARAMS, zoom: 2.5 });
    expect(screen.getByRole('button', { name: 'PlaymatSettings.collection.done' })).toBeInTheDocument();
  });

  it('announces the margins as percentages', () => {
    act(() => setPlaymatSettings({ fallbackList: [mat('A')] }));
    renderWithProviders(<PlaymatSettingsPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'PlaymatSettings.collection.edit' }));

    expect(screen.getByRole('slider', { name: 'PlaymatSettings.crop.leftMargin' }))
      .toHaveAttribute('aria-valuetext', '7');
    expect(screen.getByRole('slider', { name: 'PlaymatSettings.crop.zoom' }))
      .toHaveAttribute('aria-valuetext', '1.00');
  });
});
