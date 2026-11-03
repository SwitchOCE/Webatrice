import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ChipPicker } from './ChipPicker';

function Picker({ initial }: { initial: string[] }) {
  const [chosen, setChosen] = useState(initial);
  return <ChipPicker
    label="Tags" chosen={chosen.map((value) => ({ value, label: value }))} options={[]}
    onAdd={() => {}} onRemove={(value) => setChosen((values) => values.filter((other) => value !== other))}
    placeholder="Select tag" addLabel="Add tag" removeLabel={(label) => `Remove ${label}`}
  />;
}

it.each([
  [['A', 'B', 'C'], 'A', 'Remove B'], [['A', 'B', 'C'], 'B', 'Remove C'],
  [['A', 'B', 'C'], 'C', 'Remove B'], [['A'], 'A', 'Add tag'],
])('hands focus to the next chip, previous chip or add button after removing %s / %s', async (initial, value, target) => {
  render(<Picker initial={initial as string[]} />);
  await userEvent.click(screen.getByRole('button', { name: `Remove ${value}` }));
  expect(screen.queryByRole('button', { name: `Remove ${value}` })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: target as string })).toHaveFocus();
});
