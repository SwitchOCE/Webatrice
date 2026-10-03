import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useDialogFocus } from './useDialogFocus';

function Dialog({ isOpen, onEscape, children }: { isOpen: boolean; onEscape?: () => void; children?: React.ReactNode }) {
  const { getDialogProps } = useDialogFocus({ isOpen, onEscape });
  return isOpen ? <div role="dialog" aria-modal="true" aria-label="Dialog" {...getDialogProps()}>{children}</div> : null;
}

function Host({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      <Dialog isOpen={open} onEscape={() => setOpen(false)}>{children}</Dialog>
    </>
  );
}

describe('useDialogFocus', () => {
  it('focuses the dialog itself when it has no controls, and keeps Tab there', async () => {
    const user = userEvent.setup();
    render(<Host>Nothing to press</Host>);
    await user.click(screen.getByRole('button', { name: 'Open' }));

    expect(screen.getByRole('dialog')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('dialog')).toHaveFocus();
  });

  it('prefers a control in [data-dialog-content] over one before it', async () => {
    const user = userEvent.setup();
    render(
      <Host>
        <button type="button">Header</button>
        <div data-dialog-content><button type="button">Body</button></div>
      </Host>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));

    expect(screen.getByRole('button', { name: 'Body' })).toHaveFocus();
  });

  it('skips disabled and hidden controls when cycling', async () => {
    const user = userEvent.setup();
    render(
      <Host>
        <button type="button">First</button>
        <button type="button" disabled>Off</button>
        <div hidden><button type="button">Hidden</button></div>
        <button type="button">Last</button>
      </Host>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));

    await user.tab();
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  it('leaves focus alone on close when something outside already took it', () => {
    const { rerender } = render(
      <>
        <button type="button">Opener</button>
        <button type="button">Other</button>
        <Dialog isOpen={false}><button type="button">Inside</button></Dialog>
      </>,
    );
    screen.getByRole('button', { name: 'Opener' }).focus();
    rerender(
      <>
        <button type="button">Opener</button>
        <button type="button">Other</button>
        <Dialog isOpen><button type="button">Inside</button></Dialog>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Inside' })).toHaveFocus();

    screen.getByRole('button', { name: 'Other' }).focus();
    rerender(
      <>
        <button type="button">Opener</button>
        <button type="button">Other</button>
        <Dialog isOpen={false}><button type="button">Inside</button></Dialog>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Other' })).toHaveFocus();
  });

  it('returns focus to the original opener when a dialog is swapped for one with an autoFocus field', async () => {
    const user = userEvent.setup();
    function Flow() {
      const [stage, setStage] = useState<'idle' | 'loading' | 'form'>('idle');
      return (
        <>
          <button type="button" onClick={() => setStage('loading')}>Warn</button>
          {stage === 'loading' && (
            <Dialog isOpen><button type="button" onClick={() => setStage('form')}>Loaded</button></Dialog>
          )}
          {stage === 'form' && (
            <Dialog isOpen onEscape={() => setStage('idle')}>
              <input aria-label="Reason" autoFocus />
            </Dialog>
          )}
        </>
      );
    }
    render(<Flow />);
    await user.click(screen.getByRole('button', { name: 'Warn' }));
    await user.keyboard('{Enter}');
    expect(screen.getByRole('textbox', { name: 'Reason' })).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(screen.getByRole('button', { name: 'Warn' })).toHaveFocus();
  });
});
