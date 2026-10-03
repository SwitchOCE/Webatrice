import type { ServerInfo_Room } from '@cockatrice/sockatrice/generated';

/**
 * Text for a room's "Permissions" column, mirroring desktop
 * `RoomSelector::getRoomPermissionDisplay` (tab_server.cpp): a room's
 * permission level wins unless it is `none`, in which case its privilege
 * level is shown; an empty result (a misconfigured room definition) falls
 * back to `none`. Both levels are lower-cased, as on desktop.
 */
export function getRoomPermissionDisplay(
  { permissionlevel, privilegelevel }: Pick<ServerInfo_Room, 'permissionlevel' | 'privilegelevel'>,
): string {
  const permission = (permissionlevel ?? '').toLowerCase();
  const display = permission !== 'none' ? permission : (privilegelevel ?? '').toLowerCase();
  return display || 'none';
}
