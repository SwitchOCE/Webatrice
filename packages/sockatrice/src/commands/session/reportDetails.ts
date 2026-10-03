import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';
import { Command_ReportDetails_ext, Command_ReportDetailsSchema, Response_ReportDetails_ext } from '../../generated';

export function reportDetails(reportId: number): void {
  WebClient.instance.protobuf.sendSessionCommand(
    Command_ReportDetails_ext,
    create(Command_ReportDetailsSchema, { reportId }),
    {
      responseExt: Response_ReportDetails_ext,
      onSuccess: (response) => {
        if (response.report) {
          WebClient.instance.response.session.reportDetails?.(response.report);
        }
      },
    }
  );
}
