import { useMemo, type ReactNode } from 'react';
import { ThemeProvider } from '@mui/material/styles';

import { useApplyCardPresentation, useApplyColorScheme } from '@app/hooks';
import { createAppTheme } from '@app/services';

/**
 * Applies the appearance preferences: the design tokens through `<html data-theme>`, and MUI
 * through its theme, both following Light / Dark / System live; and the card rendering options
 * (corners, hover scale, card font size). Mount once around the app.
 */
export default function AppThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useApplyColorScheme();
  useApplyCardPresentation();
  const theme = useMemo(() => createAppTheme(scheme), [scheme]);
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
