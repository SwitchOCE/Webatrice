import type { WebSocketRoute } from '@playwright/test';

import { expect, test } from '../fixtures/test';

import { ConnectionStatus } from '../pages';
import { E2E_HOST, registerAndReachRooms } from '../fixtures/flows';

// Forced connection drop mid-session, in every browser of the matrix.
//
// Desktop parity (ConnectionController::onSocketError): a lost connection
// shows "Socket error: …", stops the tabs and reopens the Connect dialog.
// It never reconnects on its own; the user logs in again. Webatrice mirrors
// that: the session ends, the app returns to the login screen with the
// "Connection Closed" status, and stays disconnected until the user logs in.
//
// The drop is made in the network path, not in app code: every socket to the
// docker Servatrice is routed through Playwright (`routeWebSocket` +
// `connectToServer` forwards frames unchanged), and the test closes the
// server side, as a dead link or a restarted server would. The close is
// forwarded to the page's WebSocket, which sees the connection end without
// having asked for it.

test('a dropped connection returns to login and needs an explicit re-login', async ({ page }) => {
  test.setTimeout(90_000);

  const servers: ReturnType<WebSocketRoute['connectToServer']>[] = [];
  await page.routeWebSocket(
    (url) => url.hostname === E2E_HOST.host && url.port === String(E2E_HOST.port),
    (ws) => {
      servers.push(ws.connectToServer());
    },
  );

  const { login, rooms, user } = await registerAndReachRooms(page);
  const status = new ConnectionStatus(page);
  await status.expectConnected();

  for (const server of servers) {
    await server.close();
  }

  // The disconnect notice: back on the login screen with the closed status.
  await expect(login.hostPicker).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Connection Closed', { exact: true })).toBeVisible();
  await expect(status.indicator).toBeHidden();

  // No automatic reconnect: well past the keep-alive interval, still
  // disconnected and still asking for a login.
  await page.waitForTimeout(10_000);
  await expect(status.indicator).toBeHidden();
  await expect(login.loginButton).toBeVisible();

  // An explicit login restores the session.
  await login.login(user.username, user.password);
  await rooms.waitForRoomList();
  await status.expectConnected();
});
