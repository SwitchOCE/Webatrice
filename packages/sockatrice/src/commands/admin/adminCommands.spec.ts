vi.mock('../../WebClient');

import { makeCallbackHelpers } from '../../testing/callback-helpers';
import { CommandFailure } from '../../types/CommandFailure';
import { WebClient } from '../../WebClient';
import { adjustMod } from './adjustMod';
import { reloadConfig } from './reloadConfig';
import { resetUserPassword } from './resetUserPassword';
import { shutdownServer } from './shutdownServer';
import { updateServerMessage } from './updateServerMessage';
import {
  Command_AdjustMod_ext,
  Command_ReloadConfig_ext,
  Command_ResetUserPassword_ext,
  Command_ShutdownServer_ext,
  Command_UpdateServerMessage_ext,
  Response_ResetUserPassword_ext,
  Response_ResponseCode,
} from '../../generated';

import { Mock } from 'vitest';

const { invokeOnSuccess, invokeOnError } = makeCallbackHelpers(
  WebClient.instance.protobuf.sendAdminCommand as Mock,
  2
);

describe('adjustMod', () => {

  it('calls sendAdminCommand with Command_AdjustMod extension and fields', () => {
    adjustMod('alice', true, false);
    expect(WebClient.instance.protobuf.sendAdminCommand).toHaveBeenCalledWith(
      Command_AdjustMod_ext,
      expect.objectContaining({ userName: 'alice', shouldBeMod: true, shouldBeJudge: false }),
      expect.any(Object)
    );
  });

  it('onSuccess calls response.admin.adjustMod', () => {
    adjustMod('alice', true, false);
    invokeOnSuccess();
    expect(WebClient.instance.response.admin.adjustMod).toHaveBeenCalledWith('alice', true, false, undefined);
  });

  it('sends shouldBeDeveloper and forwards it on success', () => {
    adjustMod('alice', undefined, undefined, true);
    expect(WebClient.instance.protobuf.sendAdminCommand).toHaveBeenCalledWith(
      Command_AdjustMod_ext,
      expect.objectContaining({ userName: 'alice', shouldBeDeveloper: true }),
      expect.any(Object)
    );
    invokeOnSuccess();
    expect(WebClient.instance.response.admin.adjustMod).toHaveBeenCalledWith('alice', undefined, undefined, true);
  });

  it('does not call response.admin.adjustMod on permission-denied response and does not retry', () => {
    adjustMod('alice', true, false);
    (WebClient.instance.protobuf.sendAdminCommand as Mock).mockClear();
    invokeOnError(Response_ResponseCode.RespAccessDenied);
    expect(WebClient.instance.response.admin.adjustMod).not.toHaveBeenCalled();
    expect(WebClient.instance.protobuf.sendAdminCommand).not.toHaveBeenCalled();
  });

  it('reports a failure to response.admin.commandFailed with the response code', () => {
    adjustMod('alice', undefined, true);
    invokeOnError(Response_ResponseCode.RespInternalError);
    expect(WebClient.instance.response.admin.commandFailed).toHaveBeenCalledWith(
      'adjustMod', Response_ResponseCode.RespInternalError, 'alice', undefined,
    );
  });

  it('passes the transport reason when the server never answered', () => {
    adjustMod('alice', undefined, true);
    invokeOnError(Response_ResponseCode.RespNotConnected, {}, CommandFailure.Disconnected);
    expect(WebClient.instance.response.admin.commandFailed).toHaveBeenCalledWith(
      'adjustMod', Response_ResponseCode.RespNotConnected, 'alice', CommandFailure.Disconnected,
    );
  });
});

describe('reloadConfig', () => {

  it('calls sendAdminCommand with Command_ReloadConfig extension', () => {
    reloadConfig();
    expect(WebClient.instance.protobuf.sendAdminCommand).toHaveBeenCalledWith(
      Command_ReloadConfig_ext,
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('onSuccess calls response.admin.reloadConfig', () => {
    reloadConfig();
    invokeOnSuccess();
    expect(WebClient.instance.response.admin.reloadConfig).toHaveBeenCalled();
  });
});

describe('shutdownServer', () => {

  it('calls sendAdminCommand with Command_ShutdownServer extension and fields', () => {
    shutdownServer('maintenance', 10);
    expect(WebClient.instance.protobuf.sendAdminCommand).toHaveBeenCalledWith(
      Command_ShutdownServer_ext,
      expect.objectContaining({ reason: 'maintenance', minutes: 10 }),
      expect.any(Object)
    );
  });

  it('onSuccess calls response.admin.shutdownServer', () => {
    shutdownServer('maintenance', 10);
    invokeOnSuccess();
    expect(WebClient.instance.response.admin.shutdownServer).toHaveBeenCalled();
  });

  it('does not call response.admin.shutdownServer on non-Ok response code', () => {
    shutdownServer('maintenance', 10);
    invokeOnError(Response_ResponseCode.RespFunctionNotAllowed);
    expect(WebClient.instance.response.admin.shutdownServer).not.toHaveBeenCalled();
  });
});

describe('updateServerMessage', () => {

  it('calls sendAdminCommand with Command_UpdateServerMessage extension', () => {
    updateServerMessage();
    expect(WebClient.instance.protobuf.sendAdminCommand).toHaveBeenCalledWith(
      Command_UpdateServerMessage_ext,
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('onSuccess calls response.admin.updateServerMessage', () => {
    updateServerMessage();
    invokeOnSuccess();
    expect(WebClient.instance.response.admin.updateServerMessage).toHaveBeenCalled();
  });
});

describe('resetUserPassword', () => {

  it('calls sendAdminCommand with Command_ResetUserPassword', () => {
    resetUserPassword('alice');
    expect(WebClient.instance.protobuf.sendAdminCommand).toHaveBeenCalledWith(
      Command_ResetUserPassword_ext,
      expect.objectContaining({ userName: 'alice' }),
      expect.objectContaining({ responseExt: Response_ResetUserPassword_ext })
    );
  });

  it('hands the temporary password to the caller', () => {
    const onReset = vi.fn();
    resetUserPassword('alice', onReset);
    invokeOnSuccess({ userName: 'alice', temporaryPassword: 'tmp-secret' });
    expect(onReset).toHaveBeenCalledWith('alice', 'tmp-secret');
  });

  it('reports a refused reset (moderator target) to onFailure', () => {
    const onReset = vi.fn();
    const onFailure = vi.fn();
    resetUserPassword('mod1', onReset, onFailure);
    invokeOnError(Response_ResponseCode.RespAccessDenied);
    expect(onFailure).toHaveBeenCalledWith(Response_ResponseCode.RespAccessDenied, expect.anything());
    expect(onReset).not.toHaveBeenCalled();
  });
});
