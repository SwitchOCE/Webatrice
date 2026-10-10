import { waitFor } from '@testing-library/react';

import { registerModal } from './modalStack';

it('refreshes isolation for sibling additions but not modal descendant changes', async () => {
  const root = document.createElement('main');
  const background = document.createElement('section');
  const layer = document.createElement('div');
  const modal = document.createElement('div');
  const content = document.createElement('div');
  layer.dataset.modalLayer = '';
  modal.append(content);
  layer.append(modal);
  root.append(background, layer);
  document.body.append(root);

  const release = registerModal(modal);
  const setAttribute = vi.spyOn(background, 'setAttribute');
  try {
    content.append(document.createElement('span'));
    await new Promise((resolve) => setTimeout(resolve));

    expect(setAttribute).not.toHaveBeenCalledWith('inert', '');

    const lateSibling = document.createElement('aside');
    root.append(lateSibling);
    await waitFor(() => expect(lateSibling).toHaveAttribute('inert'));

    expect(background).toHaveAttribute('inert');
    release();
    expect(background).not.toHaveAttribute('inert');
    expect(lateSibling).not.toHaveAttribute('inert');
  } finally {
    release();
    root.remove();
  }
});
