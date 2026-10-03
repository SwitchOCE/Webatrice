import { fireEvent, screen, within } from '@testing-library/react';

import { renderWithProviders } from '../../../__test-utils__';
import { makeReport } from '../__mocks__/reportState';
import ReportTable, { MY_REPORT_COLUMNS, QUEUE_COLUMNS } from './ReportTable';

const rows = [
  makeReport({ reportId: 2, reportedUserName: 'zed', category: 'bug_abuse', status: 'open', gameId: 12, roomId: 1 }),
  makeReport({ reportId: 5, reportedUserName: 'amy', category: 'spam', status: 'resolved', replayId: 3 }),
];

function rowIds() {
  return screen.getAllByTestId(/^report-row-/).map((row) => row.getAttribute('data-testid'));
}

describe('ReportTable', () => {
  it('renders the desktop My Reports columns and formats the cells', () => {
    renderWithProviders(<ReportTable reports={rows} columns={MY_REPORT_COLUMNS} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(
      MY_REPORT_COLUMNS.map((c) => `Reports.column.${c}`),
    );
    const first = within(screen.getByTestId('report-row-2'));
    expect(first.getByText('Bug abuse')).toBeTruthy();
    expect(first.getByText('12')).toBeTruthy();
    expect(first.getByText('open').className).toContain('text-red-400');
  });

  it('shows replay and room in the queue columns', () => {
    renderWithProviders(<ReportTable reports={rows} columns={QUEUE_COLUMNS} selectedId={null} onSelect={vi.fn()} />);
    expect(within(screen.getByTestId('report-row-5')).getByText('Reports.column.yes')).toBeTruthy();
    expect(within(screen.getByTestId('report-row-2')).getByText('Reports.column.no')).toBeTruthy();
  });

  it('keeps server order until a header is clicked, then toggles the direction', () => {
    renderWithProviders(<ReportTable reports={rows} columns={MY_REPORT_COLUMNS} selectedId={null} onSelect={vi.fn()} />);
    expect(rowIds()).toEqual(['report-row-2', 'report-row-5']);
    fireEvent.click(screen.getByText('Reports.column.reportedUser'));
    expect(rowIds()).toEqual(['report-row-5', 'report-row-2']);
    fireEvent.click(screen.getByText('Reports.column.reportedUser'));
    expect(rowIds()).toEqual(['report-row-2', 'report-row-5']);
  });

  it('selects a row on click and marks the selected row', () => {
    const onSelect = vi.fn();
    renderWithProviders(<ReportTable reports={rows} columns={MY_REPORT_COLUMNS} selectedId={5} onSelect={onSelect} />);
    expect(screen.getByTestId('report-row-5').getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByTestId('report-row-2'));
    expect(onSelect).toHaveBeenCalledWith(2);
  });
});
