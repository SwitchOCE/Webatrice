import { useMemo, type ReactNode } from 'react';
import { ThemeProvider } from '@mui/material/styles';

import { useApplyColorScheme } from '@app/hooks';
import { createAppTheme } from '@app/services';

/**
 * Applies the appearance preference: the design tokens through `<html data-theme>`, and MUI
 * through its theme, both following Light / Dark / System live. Mount once around the app.
 */
export default function AppThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useApplyColorScheme();
  const theme = useMemo(() => createAppTheme(scheme), [scheme]);
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
