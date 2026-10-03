import { useTranslation } from 'react-i18next';

import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';

export interface StaffTableRow {
  key: string;
  cells: string[];
}

interface StaffTableProps {
  columns: string[];
  rows: StaffTableRow[];
  loading?: boolean;
}

/** Read-only result table, one per desktop QTableWidget on the Moderation tab. */
const StaffTable = ({ columns, rows, loading = false }: StaffTableProps) => {
  const { t } = useTranslation();

  return (
    <div className="moderation__table">
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            {columns.map((label) => <TableCell key={label}>{label}</TableCell>)}
          </TableRow>
        </TableHead>
        <TableBody>
          {loading && (
            <TableRow>
              <TableCell colSpan={columns.length}>{t('ModerationPage.value.loading')}</TableCell>
            </TableRow>
          )}
          {!loading && rows.map((row) => (
            <TableRow key={row.key} hover>
              {row.cells.map((cell, index) => <TableCell key={columns[index]}>{cell}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default StaffTable;
