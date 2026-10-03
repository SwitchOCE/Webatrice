import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Check, Copy, Link2 } from 'lucide-react';

import { formatShareExpiry } from '../deckSharing';
import { copyShareLink, type DeckShareCreateState } from '../hooks/useDeckSharing';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { DeckDialogFrame } from './DeckDialogFrame';

/** Servatrice keeps a share's name in a 64-character column (`cockatrice_deck_share.name`). */
const MAX_SHARE_NAME_LENGTH = 64;

const shareDeckSchema = z.object({ name: z.string().max(MAX_SHARE_NAME_LENGTH) });

type ShareDeckValues = z.infer<typeof shareDeckSchema>;

export interface ShareDeckDialogProps {
  open: boolean;
  /** Desktop's default: "Shared deck" from the editor, "Shared decks" from storage. */
  defaultName: string;
  state: DeckShareCreateState;
  onClose: () => void;
  /** The trimmed name, or `defaultName` when left empty (desktop does the same). */
  onCreate: (name: string) => void;
}

/**
 * Desktop `DlgShareDeck` (and the storage tab's share bar): name the share,
 * create the link, then show it with its expiry. Desktop copies the link to
 * the clipboard on its own; a browser may refuse that once the server has
 * answered, so the link is also shown with a Copy button.
 */
export function ShareDeckDialog({ open, defaultName, state, onClose, onCreate }: ShareDeckDialogProps) {
  const { t } = useTranslation();
  const { control, handleSubmit, reset } = useForm<ShareDeckValues>({
    defaultValues: { name: defaultName },
    resolver: zodResolver(shareDeckSchema),
  });
  const [copiedAgain, setCopiedAgain] = useState(false);

  useEffect(() => {
    if (open) {
      reset({ name: defaultName });
      setCopiedAgain(false);
    }
  }, [open, defaultName, reset]);
  useEscapeKey(open, onClose);

  if (!open) {
    return null;
  }

  const submit = handleSubmit(({ name }) => onCreate(name.trim() || defaultName));
  const created = state.status === 'created' ? state : null;

  return (
    <DeckDialogFrame onClose={onClose}>
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label={t('DeckSharing.title')}
        className="relative w-full max-w-md rounded-xl bg-bg-surface border border-border-subtle shadow-glow overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-border-subtle">
          <h2 className="font-modern text-lg font-semibold text-text-primary">{t('DeckSharing.title')}</h2>
        </div>
        <div className="px-5 py-4 space-y-3 text-sm text-text-secondary">
          {created ? (
            <>
              <p>{t(created.copied ? 'DeckSharing.createdCopied' : 'DeckSharing.created')}</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={created.link}
                  aria-label={t('DeckSharing.title')}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 min-w-0 bg-bg-base border border-border-subtle rounded-md px-3 py-2 text-xs text-text-primary"
                />
                <button
                  type="button"
                  onClick={() => {
                    void copyShareLink(created.link).then(setCopiedAgain);
                  }}
                  className={[
                    'inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium shrink-0',
                    'text-text-primary bg-bg-elevated border border-border-strong hover:bg-border-subtle',
                  ].join(' ')}
                >
                  {copiedAgain ? <Check size={13} /> : <Copy size={13} />}
                  {t(copiedAgain ? 'DeckSharing.copied' : 'DeckSharing.copy')}
                </button>
              </div>
              <p>{t('DeckSharing.expires', { date: formatShareExpiry(created.expiresAt) })}</p>
            </>
          ) : (
            <Controller
              name="name"
              control={control}
              render={({ field, fieldState }) => (
                <label className="block">
                  <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                    {t('DeckSharing.nameLabel')}
                  </span>
                  <input
                    {...field}
                    type="text"
                    autoFocus
                    maxLength={MAX_SHARE_NAME_LENGTH}
                    disabled={state.status === 'pending'}
                    aria-invalid={fieldState.invalid}
                    className={[
                      'mt-1 w-full bg-bg-base border border-border-subtle rounded-md px-3 py-2 text-sm text-text-primary',
                      'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent',
                    ].join(' ')}
                  />
                </label>
              )}
            />
          )}
          {state.status === 'pending' && <p role="status">{t('DeckSharing.creating')}</p>}
          {state.status === 'failed' && <p role="alert" className="text-red-300">{state.message}</p>}
        </div>
        <div className="px-5 py-3 border-t border-border-subtle flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-bg-elevated"
          >
            {t(created ? 'DeckSharing.close' : 'DeckSharing.cancel')}
          </button>
          {!created && (
            <button
              type="submit"
              disabled={state.status === 'pending'}
              className={[
                'inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-semibold',
                'bg-accent text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed',
              ].join(' ')}
            >
              <Link2 size={13} /> {t('DeckSharing.create')}
            </button>
          )}
        </div>
      </form>
    </DeckDialogFrame>
  );
}
