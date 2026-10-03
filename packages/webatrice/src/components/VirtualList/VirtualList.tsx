import { AriaRole, ReactNode, Ref } from 'react';
import { List, ListImperativeAPI, ListProps, RowComponentProps } from 'react-window';

import './VirtualList.css';

interface VirtualRowsData<T> {
  items: T[];
  renderRow: (item: T, index: number) => ReactNode;
  /** False when the caller gives the list its own role (e.g. a grid's rowgroup), whose rows carry their own role. */
  listItems: boolean;
}

interface VirtualRowsProps<T> {
  items: T[];
  rowHeight: number;
  className?: string;
  renderRow: (item: T, index: number) => ReactNode;
  role?: AriaRole;
  /** For callers that scroll a row into view (keyboard navigation). */
  listRef?: Ref<ListImperativeAPI>;
  /** Reports the visible and rendered (overscanned) row ranges, e.g. to keep a grid's tab stop on a mounted row. */
  onRowsRendered?: ListProps<VirtualRowsData<T>>['onRowsRendered'];
}

function RowsRow<T>({ ariaAttributes, index, style, items, renderRow, listItems }: RowComponentProps<VirtualRowsData<T>>) {
  // react-window's default role="list" needs listitem children; its per-row
  // role/aria-posinset/aria-setsize also tell assistive tech where a row sits
  // in the full (unrendered) list.
  return <div style={style} {...(listItems ? ariaAttributes : {})}>{renderRow(items[index], index)}</div>;
}

/**
 * Windowed list for large live collections — rows built lazily for the visible
 * window only. Pass a referentially stable `renderRow`. See
 * webatrice.instructions.md § Virtualized lists for when to prefer this and why.
 */
export function VirtualRows<T>({ items, rowHeight, className = '', renderRow, role, listRef, onRowsRendered }: VirtualRowsProps<T>) {
  return (
    <div className="virtual-list">
      <List<VirtualRowsData<T>>
        className={`virtual-list__list ${className}`}
        // Only override when set — passing role={undefined} would spread over
        // react-window's built-in role="list" and strip it from plain lists.
        {...(role ? { role } : {})}
        listRef={listRef}
        onRowsRendered={onRowsRendered}
        rowCount={items.length}
        rowHeight={rowHeight}
        rowComponent={RowsRow}
        rowProps={{ items, renderRow, listItems: !role }}
      />
    </div>
  );
}

// Module-level so the renderRow identity stays stable across renders (row
// memoization) — see webatrice.instructions.md § Virtualized lists.
const renderNode = (node: ReactNode): ReactNode => node;

interface VirtualListProps {
  items: ReactNode[];
  className?: string;
  size?: number;
}

/** Thin wrapper for callers that already hold a prebuilt `ReactNode[]`. */
const VirtualList = ({ items, className = '', size = 30 }: VirtualListProps) => (
  <VirtualRows items={items} rowHeight={size} className={className} renderRow={renderNode} />
);

export default VirtualList;
