import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';

import { AlertDialog } from '@app/dialogs';

import {
  forceActivateUserSchema,
  grantReplayAccessSchema,
  type ForceActivateUserFormValues,
  type GrantReplayAccessFormValues,
} from './moderationFormSchemas';
import { BUTTON_PRIMARY_CLASS, FIELD_CLASS, LABEL_CLASS } from './moderationStyles';
import { useModeratorFunctions } from './useModeratorFunctions';

const grantResolver = zodResolver(grantReplayAccessSchema);
const activateResolver = zodResolver(forceActivateUserSchema);

/**
 * The "Server moderator functions" group of desktop's TabAdmin: a replay id
 * field with "Grant Replay Access" and a user name field with "Force Activate
 * User", each button enabled only once its field has text.
 */
const ModeratorFunctions = () => {
  const { t } = useTranslation();
  const { notice, dismissNotice, grantReplayAccess, forceActivateUser } = useModeratorFunctions();

  const grantForm = useForm<GrantReplayAccessFormValues>({ defaultValues: { replayId: '' }, resolver: grantResolver });
  const activateForm = useForm<ForceActivateUserFormValues>({ defaultValues: { userName: '' }, resolver: activateResolver });

  return (
    <section className="flex flex-col gap-3" aria-labelledby="moderator-functions-title">
      <h2 id="moderator-functions-title" className={LABEL_CLASS}>{t('Moderation.functions.title')}</h2>

      <form
        className="flex gap-2 items-start"
        onSubmit={grantForm.handleSubmit(({ replayId }) => grantReplayAccess(Number(replayId)))}
      >
        <Controller
          name="replayId"
          control={grantForm.control}
          render={({ field }) => (
            <input
              {...field}
              inputMode="numeric"
              placeholder={t('Moderation.functions.replayId')}
              aria-label={t('Moderation.functions.replayId')}
              onChange={(e) => field.onChange(e.target.value.replace(/\D/g, ''))}
              className={FIELD_CLASS}
            />
          )}
        />
        <button type="submit" disabled={!grantForm.watch('replayId')} className={BUTTON_PRIMARY_CLASS + ' whitespace-nowrap'}>
          {t('Moderation.functions.grantReplayAccess')}
        </button>
      </form>

      <form
        className="flex gap-2 items-start"
        onSubmit={activateForm.handleSubmit(({ userName }) => forceActivateUser(userName))}
      >
        <Controller
          name="userName"
          control={activateForm.control}
          render={({ field }) => (
            <input
              {...field}
              placeholder={t('Moderation.functions.userToActivate')}
              aria-label={t('Moderation.functions.userToActivate')}
              className={FIELD_CLASS}
            />
          )}
        />
        <button type="submit" disabled={!activateForm.watch('userName')} className={BUTTON_PRIMARY_CLASS + ' whitespace-nowrap'}>
          {t('Moderation.functions.forceActivate')}
        </button>
      </form>

      <AlertDialog
        isOpen={notice !== null}
        title={notice?.title ?? ''}
        message={notice?.message ?? ''}
        severity={notice?.severity}
        onDismiss={dismissNotice}
      />
    </section>
  );
};

export default ModeratorFunctions;
