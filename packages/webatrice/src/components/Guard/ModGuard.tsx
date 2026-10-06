import { Navigate } from 'react-router-dom';

import { useUserCapabilities } from '@app/hooks';
import { RouteEnum } from '@app/types';
const ModGuard = () => {
  const { isModerator } = useUserCapabilities();
  return !isModerator
    ? <Navigate to={RouteEnum.SERVER} />
    : <></>;
};

export default ModGuard;
