import { useTranslation } from 'react-i18next';

import { PageTitle } from '@app/components';
import { Layout } from '@app/feature-wrappers/layout';

export default function People() {
  const { t } = useTranslation();
  return (
    <Layout>
      <PageTitle title={t('People.title')} />
    </Layout>
  );
}
