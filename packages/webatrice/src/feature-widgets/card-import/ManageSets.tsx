import { useCallback, type MouseEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardDoubleArrowDownIcon from '@mui/icons-material/KeyboardDoubleArrowDown';
import KeyboardDoubleArrowUpIcon from '@mui/icons-material/KeyboardDoubleArrowUp';

import { VirtualRows } from '@app/components';

import type { MoveDirection, SetRow, SetSortColumn } from './manageSetsModel';
import { useManageSets } from './useManageSets';

import './CardDatabase.css';

const ROW_HEIGHT = 32;
const COLUMNS: SetSortColumn[] = ['code', 'longName', 'setType', 'releaseDate'];

const MOVES: Array<{ direction: MoveDirection; icon: ReactNode }> = [
  { direction: 'top', icon: <KeyboardDoubleArrowUpIcon fontSize="small" /> },
  { direction: 'up', icon: <KeyboardArrowUpIcon fontSize="small" /> },
  { direction: 'down', icon: <KeyboardArrowDownIcon fontSize="small" /> },
  { direction: 'bottom', icon: <KeyboardDoubleArrowDownIcon fontSize="small" /> },
];

export interface ManageSetsProps {
  /** Called after a successful Save (desktop's OK closes the window). */
  onSaved?: () => void;
  onCancel?: () => void;
}

/** Desktop's "Manage sets" window (`dlg_manage_sets.cpp`). */
const ManageSets = ({ onSaved, onCancel }: ManageSetsProps) => {
  const { t } = useTranslation();
  const manage = useManageSets();
  const { select, toggleEnabled, selected } = manage;
  const sorted = manage.sort !== null;
  const noSelection = selected.size === 0;

  const renderRow = useCallback((row: SetRow) => {
    const onClick = (e: MouseEvent) => select(row.code, { toggle: e.ctrlKey || e.metaKey, range: e.shiftKey });
    return (
      <div
        className={`cardDatabase-setRow${selected.has(row.code) ? ' is-selected' : ''}`}
        role="row"
        aria-selected={selected.has(row.code)}
        onClick={onClick}
      >
        <span role="gridcell" className="cardDatabase-setCell is-check">
          <Checkbox
            size="small"
            checked={row.enabled}
            onClick={(e) => e.stopPropagation()}
            onChange={() => toggleEnabled(row.code)}
            slotProps={{ input: { 'aria-label': row.code } }}
          />
        </span>
        <span role="gridcell" className="cardDatabase-setCell is-code">{row.code}</span>
        <span role="gridcell" className="cardDatabase-setCell is-name">{row.longName}</span>
        <span role="gridcell" className="cardDatabase-setCell">{row.setType}</span>
        <span role="gridcell" className="cardDatabase-setCell">{row.releaseDate}</span>
      </div>
    );
  }, [select, toggleEnabled, selected]);

  const save = async () => {
    if (await manage.save()) {
      onSaved?.();
    }
  };

  const cancel = () => {
    manage.discard();
    onCancel?.();
  };

  if (!manage.loading && manage.rows.length === 0) {
    return <div className="cardDatabase-empty">{t('ManageSets.empty')}</div>;
  }

  const many = selected.size > 1;

  return (
    <div className="cardDatabase-manageSets">
      <div className="cardDatabase-toolbar">
        <TextField
          size="small"
          fullWidth
          placeholder={t('ManageSets.search')}
          value={manage.search}
          onChange={(e) => manage.setSearch(e.target.value)}
          slotProps={{ htmlInput: { 'aria-label': t('ManageSets.search') } }}
        />
        <Tooltip title={t('ManageSets.tooltip.defaultOrder')} describeChild>
          <span>
            <Button onClick={manage.restoreDefault}>{t('ManageSets.button.defaultOrder')}</Button>
          </span>
        </Tooltip>
      </div>

      <div className="cardDatabase-setsBody">
        <div className="cardDatabase-moves">
          {MOVES.map(({ direction, icon }) => (
            <Tooltip key={direction} title={t(`ManageSets.move.${direction}`)}>
              <span>
                <IconButton
                  size="small"
                  aria-label={t(`ManageSets.move.${direction}`)}
                  disabled={noSelection || sorted}
                  onClick={() => manage.move(direction)}
                >
                  {icon}
                </IconButton>
              </span>
            </Tooltip>
          ))}
        </div>

        <div className="cardDatabase-setTable" role="grid" aria-rowcount={manage.visibleRows.length}>
          <div className="cardDatabase-setRow is-header" role="row">
            <span role="columnheader" className="cardDatabase-setCell is-check">{t('ManageSets.column.enabled')}</span>
            {COLUMNS.map((column) => {
              const active = manage.sort?.column === column;
              const arrow = active ? (manage.sort!.ascending ? ' ▲' : ' ▼') : '';
              return (
                <span
                  key={column}
                  role="columnheader"
                  aria-sort={active ? (manage.sort!.ascending ? 'ascending' : 'descending') : 'none'}
                  className={`cardDatabase-setCell is-${column}`}
                >
                  <button type="button" className="cardDatabase-sortButton" onClick={() => manage.cycleSort(column)}>
                    {t(`ManageSets.column.${column}`)}{arrow}
                  </button>
                </span>
              );
            })}
          </div>
          <VirtualRows items={manage.visibleRows} rowHeight={ROW_HEIGHT} renderRow={renderRow} role="rowgroup" />
        </div>
      </div>

      <div className="cardDatabase-actions">
        <Button onClick={() => (many ? manage.enableSelected(true) : manage.enableAll(true))}>
          {t(many ? 'ManageSets.button.enableSelected' : 'ManageSets.button.enableAll')}
        </Button>
        <Button onClick={() => (many ? manage.enableSelected(false) : manage.enableAll(false))}>
          {t(many ? 'ManageSets.button.disableSelected' : 'ManageSets.button.disableAll')}
        </Button>
      </div>

      {sorted && (
        <div className="cardDatabase-note" role="note">
          <div>{t('ManageSets.sortNote')}</div>
          <Tooltip title={t('ManageSets.tooltip.useSorting')} describeChild>
            <Button size="small" onClick={manage.applySortAsPriority}>{t('ManageSets.button.useSorting')}</Button>
          </Tooltip>
        </div>
      )}

      <details className="cardDatabase-hints">
        <summary>{t('ManageSets.hints.title')}</summary>
        <p>{t('ManageSets.hints.selection')}</p>
        <p>{t('ManageSets.hints.deckEditor')}</p>
        <p>{t('ManageSets.hints.cardArt')}</p>
      </details>

      {manage.error && <div className="error">{manage.error}</div>}

      <div className="cardDatabase-actions is-end">
        <Button onClick={cancel} disabled={manage.saving}>{t('ManageSets.button.cancel')}</Button>
        <Button variant="contained" onClick={save} disabled={manage.saving || !manage.dirty}>
          {t('ManageSets.button.save')}
        </Button>
      </div>
    </div>
  );
};

export default ManageSets;
