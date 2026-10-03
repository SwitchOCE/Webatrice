---
'@cockatrice/datatrice': minor
---

State for user reports and the moderation queue (Cockatrice 3.1). `server.reports` holds the caller's reports and the moderator queue as id lists over shared rows, full report details with chat log and comment thread, queue statistics and the last replay fetched by game id, with selectors (`getMyReports`, `getReportQueue`, `getReportDetails`, `getReportQueueStatusCounts`, `getReportStats`, `getReportReplay`, …). Assign and resolve confirmations update the stored row. The reported user's history is the Moderation page's `ReportUserInfo` lookup, read with `getUserInvestigation`. `REPORT_RESOLVED` / `REPORT_COMMENT` notifications also raise `getLastReportNotice`, so views can pop up and refresh. `server.filterReports`, `countReportStatuses` and `isReportOpen` mirror desktop's queue filter and gating.

`ReportStatus` is also exported from the package root, like `ServerCapability`: inside the `server` namespace the bundler emits a const-and-type pair as a type only.
