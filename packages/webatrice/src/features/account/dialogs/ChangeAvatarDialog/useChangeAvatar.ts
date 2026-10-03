import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePushToast } from '@app/components';
import { useCommandFailureMessage } from '@app/hooks';
import { useWebClient } from '@cockatrice/datatrice/react';

import { changeAvatarErrorMessage } from '../accountResponseMessages';
import { encodeAvatar, loadImage } from './encodeAvatar';

export interface AvatarPreview {
  url: string;
  image: HTMLImageElement;
}

export interface ChangeAvatar {
  preview: AvatarPreview | null;
  pending: boolean;
  error: string | null;
  /** Decodes a picked file into the preview; resolves false when it isn't a readable image. */
  pick: (file: File | null) => Promise<boolean>;
  /** Uploads the previewed image, or an empty image (removing the avatar) when none is chosen. */
  submit: () => Promise<void>;
}

export function useChangeAvatar(onDone: () => void): ChangeAvatar {
  const { t } = useTranslation();
  const webClient = useWebClient();
  const pushToast = usePushToast();
  const failureMessage = useCommandFailureMessage();
  const [preview, setPreview] = useState<AvatarPreview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (preview) {
      URL.revokeObjectURL(preview.url);
    }
  }, [preview]);

  const pick = async (file: File | null) => {
    if (!file) {
      setPreview(null);
      return true;
    }
    const url = URL.createObjectURL(file);
    try {
      setPreview({ url, image: await loadImage(url) });
      return true;
    } catch {
      URL.revokeObjectURL(url);
      setPreview(null);
      return false;
    }
  };

  const submit = async () => {
    setPending(true);
    setError(null);
    let image: Uint8Array;
    try {
      image = preview ? await encodeAvatar(preview.image) : new Uint8Array();
    } catch {
      setPending(false);
      setError(t('AccountDialogs.error.avatarFailed'));
      return;
    }
    webClient.request.session.accountImage(
      image,
      () => {
        setPending(false);
        pushToast(t('ChangeAvatarDialog.success'));
        onDone();
      },
      (responseCode, failure) => {
        setPending(false);
        setError(failureMessage(failure, changeAvatarErrorMessage(t, responseCode)));
      },
    );
  };

  return { preview, pending, error, pick, submit };
}
