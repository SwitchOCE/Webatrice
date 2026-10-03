import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';
import { Command_ReportMyList_ext, Command_ReportMyListSchema, Response_ReportMyList_ext } from '../../generated';

// Desktop DlgMyReports shows "Failed to load reports." on any error code, so a
// failure goes back to the caller; the list itself lands in the store.
export function reportMyList(onFailure?: (responseCode: number) => void): void {
  WebClient.instance.protobuf.sendSessionCommand(Command_ReportMyList_ext, create(Command_ReportMyListSchema), {
    responseExt: Response_ReportMyList_ext,
    onSuccess: (response) => {
      WebClient.instance.response.session.reportMyList?.(response.reports);
    },
    onError: (responseCode) => {
      WebClient.instance.response.session.commandFailed?.('reportMyList', responseCode, '');
      onFailure?.(responseCode);
    },
  });
}
