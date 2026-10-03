import { formatReportCategory, formatReportDate, formatReportTime, reportStatusClass } from './reportFormat';

describe('formatReportCategory', () => {
  it.each([
    ['bug_abuse', 'Bug abuse'],
    ['hate_speech', 'Hate speech'],
    ['spam', 'Spam'],
    ['', ''],
  ])('%j -> %j', (input, expected) => {
    expect(formatReportCategory(input)).toBe(expected);
  });
});

describe('formatReportTime', () => {
  it('formats epoch seconds as local yyyy-MM-dd hh:mm', () => {
    const seconds = BigInt(new Date(2026, 7, 21, 9, 5, 59).getTime() / 1000);
    expect(formatReportTime(seconds)).toBe('2026-08-21 09:05');
    expect(formatReportDate(seconds)).toBe('2026-08-21');
  });
});

describe('reportStatusClass', () => {
  it('colours the four known statuses and leaves others alone', () => {
    expect(reportStatusClass('open')).toBe('text-danger');
    expect(reportStatusClass('assigned')).toBe('text-warning');
    expect(reportStatusClass('resolved')).toBe('text-success');
    expect(reportStatusClass('dismissed')).toBe('text-text-muted');
    expect(reportStatusClass('other')).toBe('');
  });
});
