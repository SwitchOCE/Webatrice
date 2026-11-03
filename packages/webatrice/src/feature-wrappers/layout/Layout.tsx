import { ReactNode } from 'react';

import NavRail from './NavRail';
import TopBar from './TopBar';
import { useNavRailHidden } from './hooks/useNavRailHidden';

interface LayoutProps {
  showNav?: boolean;
  children: ReactNode;
  className?: string;
  noHeightLimit?: boolean;
}

function Layout({ children, className, showNav = true, noHeightLimit = false }: LayoutProps) {
  const [railHidden] = useNavRailHidden();
  const heightLimit = noHeightLimit ? '' : 'min-h-0';

  return (
    <div className={['flex h-full flex-col bg-bg-base', heightLimit].join(' ')}>
      {showNav && <TopBar />}
      <div className={['flex flex-1', heightLimit].join(' ')}>
        {showNav && !railHidden && <NavRail />}
        <main tabIndex={-1} className="flex-1 min-w-0 min-h-0 overflow-clip">
          <div className={`h-full ${className ?? ''}`}>{children}</div>
        </main>
      </div>
    </div>
  );
}

export default Layout;
