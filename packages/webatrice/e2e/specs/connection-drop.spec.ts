import type { WebSocketRoute } from '@playwright/test';

import { expect, test } from '../fixtures/test';

import { ConnectionStatus } from '../pages';
import { E2E_HOST, registerAndReachRooms } from '../fixtures/flows';

// Forced connection drop mid-session, in every browser of the matrix.
//
// Desktop parity (ConnectionController::onSocketError): a lost connection
// shows "Socket error: …", stops the tabs and reopens the Connect dialog.
// Desktop never retries the socket automatically. Webatrice keeps transport
// retries (up to five failed attempts), and the login page probes the selected
// host, so new sockets may open after the drop. None of them may carry a
// command: the session is not re-authenticated, and the user must log in again.
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
  const sent: number[] = [];
  await page.routeWebSocket(
    (url) => url.hostname === E2E_HOST.host && url.port === String(E2E_HOST.port),
    (ws) => {
      const index = servers.length;
      const server = ws.connectToServer();
      servers.push(server);
      sent[index] = 0;
      ws.onMessage((message) => {
        sent[index] += 1;
        server.send(message);
      });
    },
  );

  const { login, rooms, user } = await registerAndReachRooms(page);
  const status = new ConnectionStatus(page);
  await status.expectConnected();

  const socketsBeforeDrop = servers.length;
  for (const server of [...servers]) {
    await server.close();
  }

  await expect(login.hostPicker).toBeVisible({ timeout: 15_000 });
  await expect(status.indicator).toBeHidden();

  await page.waitForTimeout(10_000);
  const socketsAfterWait = servers.length;
  await page.waitForTimeout(3_000);
  expect(servers).toHaveLength(socketsAfterWait);
  expect(sent.slice(socketsBeforeDrop)).toEqual(sent.slice(socketsBeforeDrop).map(() => 0));
  await expect(status.indicator).toBeHidden();
  await expect(login.loginButton).toBeVisible();

  await login.login(user.username, user.password);
  await rooms.waitForRoomList();
  await status.expectConnected();
});
