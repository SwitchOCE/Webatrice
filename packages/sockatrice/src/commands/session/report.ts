import { create } from '@bufbuild/protobuf';
import { WebClient } from '../../WebClient';
import { Command_Report_ext, Command_ReportSchema, type ReportParams } from '../../generated';

// Submitting a report is a one-shot dialog action (desktop DlgReportUser), so the
// outcome goes back to the caller like replaySubmitCode. RespTooManyRequests is
// the per-user rate limit; RespNameNotFound an unknown reported user.
export function report(
  params: ReportParams,
  onSubmitted?: () => void,
  onFailure?: (responseCode: number) => void,
): void {
  WebClient.instance.protobuf.sendSessionCommand(
    Command_Report_ext,
    create(Command_ReportSchema, params),
    {
      onSuccess: onSubmitted,
      onError: onFailure,
    }
  );
}
