import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const { showSystemNotification } = vi.hoisted(() => ({ showSystemNotification: vi.fn() }));
vi.mock('@app/services', () => ({ showSystemNotification }));

import { ToastProvider } from '../Toast';
import { useNotify } from './useNotify';

const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>;

describe('useNotify', () => {
  it('uses an OS notification when one is shown, and raises no toast', () => {
    showSystemNotification.mockReturnValue(true);
    const onActivate = vi.fn();
    const { result } = renderHook(() => useNotify(), { wrapper });

    let outcome;
    act(() => {
      outcome = result.current({ title: 'From bob', body: 'hi', tag: 'pm:bob', system: true, toast: true, onActivate });
    });

    expect(outcome).toBe('system');
    expect(showSystemNotification).toHaveBeenCalledWith({ title: 'From bob', body: 'hi', tag: 'pm:bob', onClick: onActivate });
    expect(screen.queryByText('From bob')).not.toBeInTheDocument();
  });

  it('falls back to a clickable toast when no OS notification is shown', () => {
    showSystemNotification.mockReturnValue(false);
    const onActivate = vi.fn();
    const { result } = renderHook(() => useNotify(), { wrapper });

    act(() => {
      expect(result.current({ title: 'From bob', body: 'hi', system: true, toast: true, onActivate })).toBe('toast');
    });

    fireEvent.click(screen.getByText('From bob'));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('skips the OS notification when the user turned the popup off', () => {
    const { result } = renderHook(() => useNotify(), { wrapper });

    act(() => {
      result.current({ title: 'x', system: false, toast: true });
    });

    expect(showSystemNotification).not.toHaveBeenCalled();
  });

  it('does nothing when neither path is wanted', () => {
    showSystemNotification.mockReturnValue(false);
    const { result } = renderHook(() => useNotify(), { wrapper });

    act(() => {
      expect(result.current({ title: 'quiet', system: true, toast: false })).toBe('none');
    });
    expect(screen.queryByText('quiet')).not.toBeInTheDocument();
  });
});

describe('NotificationToast', () => {
  it('truncates a long preview', async () => {
    const { default: NotificationToast } = await import('./NotificationToast');
    render(<NotificationToast title="t" body={'y'.repeat(120)} />);
    expect(screen.getByText(`${'y'.repeat(100)}…`)).toBeInTheDocument();
  });
});
