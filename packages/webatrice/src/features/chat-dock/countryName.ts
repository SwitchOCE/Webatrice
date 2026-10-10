export function countryName(code: string, locale: string): string {
  if (!code) {
    return '';
  }
  try {
    return new Intl.DisplayNames([locale.replaceAll('_', '-'), 'en'], { type: 'region' }).of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}
