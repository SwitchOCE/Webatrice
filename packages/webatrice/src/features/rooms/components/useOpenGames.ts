import { useCallback } from 'react';
import { rooms, type Game, type GameSortField, type SortDirection } from '@cockatrice/datatrice';
import { useAppDispatch, useAppSelector } from '@app/store';

export interface OpenGames {
  sortBy: { field: string; order: string };
  games: Game[];
  selectedGameId: number | undefined;
  setSort: (field: string, order: SortDirection) => void;
  handleSelect: (gameId: number) => void;
  handleActivate: (gameId: number) => void;
}

export interface UseOpenGamesArgs {
  roomId: number;
  onActivateGame?: (gameId: number) => void;
}

export function useOpenGames({ roomId, onActivateGame }: UseOpenGamesArgs): OpenGames {
  const dispatch = useAppDispatch();
  const sortBy = useAppSelector((state) => rooms.Selectors.getSortGamesBy(state));
  const games = useAppSelector((state) => rooms.Selectors.getFilteredRoomGames(state, roomId));
  const selectedGameId = useAppSelector((state) => rooms.Selectors.getSelectedGameId(state, roomId));

  const setSort = useCallback((field: string, order: SortDirection) => {
    dispatch(rooms.Actions.sortGames({ roomId, field: field as GameSortField, order }));
  }, [dispatch, roomId]);

  const handleSelect = useCallback((gameId: number) => {
    dispatch(rooms.Actions.selectGame({ roomId, gameId }));
  }, [dispatch, roomId]);

  const handleActivate = useCallback((gameId: number) => {
    dispatch(rooms.Actions.selectGame({ roomId, gameId }));
    onActivateGame?.(gameId);
  }, [dispatch, roomId, onActivateGame]);

  return { sortBy, games, selectedGameId, setSort, handleSelect, handleActivate };
}
