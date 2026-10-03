import { createContext, useContext } from 'react';

export interface UserGamesApi {
  /** Open desktop's "Show this user's games" selector for `userName`. */
  open: (userName: string) => void;
}

export const UserGamesContext = createContext<UserGamesApi | null>(null);

/** The games selector opener; null outside a `UserGamesProvider`. */
export function useUserGames(): UserGamesApi | null {
  return useContext(UserGamesContext);
}
