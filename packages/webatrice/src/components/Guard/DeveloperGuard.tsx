import { Navigate } from 'react-router-dom';

import { server } from '@cockatrice/datatrice';
import { useAppSelector } from '@app/store';
import { RouteEnum } from '@app/types';

// Developer staff role (Cockatrice 3.1): desktop offers the Developer tab only to
// users with the IsDeveloper flag.
const DeveloperGuard = () => {
  const isDeveloper = useAppSelector(server.Selectors.getIsUserDeveloper);
  return !isDeveloper
    ? <Navigate to={RouteEnum.SERVER} />
    : <></>;
};

export default DeveloperGuard;
