import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';
import { Command_ReportMyList_ext, Command_ReportMyListSchema, Response_ReportMyList_ext } from '../../generated';

export function reportMyList(): void {
  WebClient.instance.protobuf.sendSessionCommand(Command_ReportMyList_ext, create(Command_ReportMyListSchema), {
    responseExt: Response_ReportMyList_ext,
    onSuccess: (response) => {
      WebClient.instance.response.session.reportMyList?.(response.reports);
    },
  });
}
