import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';

import { AuthGuard, CapabilityGuard, DeveloperGuard } from '@app/components';
import { Layout } from '@app/feature-wrappers/layout';
import { ServerCapability } from '@cockatrice/datatrice';

import { buildCommandRows, buildStatRows } from './serverStatsRows';
import { MAX_REFRESH_INTERVAL_SECS, MIN_REFRESH_INTERVAL_SECS, useDeveloper } from './useDeveloper';

import './Developer.css';

const DeveloperContent = () => {
  const { t } = useTranslation();
  const developer = useDeveloper();
  const [intervalText, setIntervalText] = useState(String(developer.intervalSecs));

  useEffect(() => {
    setIntervalText(String(developer.intervalSecs));
  }, [developer.intervalSecs]);

  const statRows = developer.stats ? buildStatRows(developer.stats, t) : [];
  const commandRows = developer.stats ? buildCommandRows(developer.stats.commandStats) : [];

  return (
    <>
      <div className="developer__tables">
        <Paper className="developer__stats">
          <Table size="small" aria-label={t('Developer.table.stats')}>
            <TableHead>
              <TableRow>
                <TableCell>{t('Developer.column.statistic')}</TableCell>
                <TableCell>{t('Developer.column.value')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {statRows.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className={row.section ? 'developer__section' : undefined}>{row.label}</TableCell>
                  <TableCell>{row.value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
        <Paper className="developer__commands">
          <Table size="small" stickyHeader aria-label={t('Developer.table.commands')}>
            <TableHead>
              <TableRow>
                <TableCell>{t('Developer.column.command')}</TableCell>
                <TableCell align="right">{t('Developer.column.count')}</TableCell>
                <TableCell align="right">{t('Developer.column.totalMs')}</TableCell>
                <TableCell align="right">{t('Developer.column.avgMs')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {commandRows.map((row) => (
                <TableRow key={row.name}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell align="right">{row.count}</TableCell>
                  <TableCell align="right">{row.totalMs}</TableCell>
                  <TableCell align="right">{row.avgMs}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      </div>

      <div className="developer__controls">
        <span className="developer__status" role="status">{developer.status}</span>
        <FormControlLabel
          title={t('Developer.autoRefresh.tooltip')}
          control={(
            <Checkbox
              checked={developer.autoRefresh}
              onChange={(event) => developer.setAutoRefresh(event.target.checked)}
            />
          )}
          label={t('Developer.autoRefresh.label')}
        />
        <TextField
          size="small"
          type="number"
          disabled={!developer.autoRefresh}
          value={intervalText}
          title={t('Developer.autoRefresh.intervalTooltip')}
          onChange={(event) => setIntervalText(event.target.value)}
          onBlur={() => developer.setIntervalSecs(Number(intervalText))}
          slotProps={{
            htmlInput: {
              min: MIN_REFRESH_INTERVAL_SECS,
              max: MAX_REFRESH_INTERVAL_SECS,
              'aria-label': t('Developer.autoRefresh.interval'),
            },
          }}
          className="developer__interval"
        />
        <Button variant="contained" onClick={developer.refresh}>{t('Developer.button.refresh')}</Button>
      </div>
    </>
  );
};

const Developer = () => (
  <Layout className="developer scrollable">
    <AuthGuard />
    <DeveloperGuard>
      <CapabilityGuard capability={ServerCapability.DEVELOPER_ROLE}>
        <DeveloperContent />
      </CapabilityGuard>
    </DeveloperGuard>
  </Layout>
);

export default Developer;
