export function movePlaymat<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
    return [...list];
  }
  const next = [...list];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

type CropKey = 'marginPctL' | 'marginPctR' | 'verticalOffset' | 'zoom';

export const CROP_LABEL_KEYS: Record<CropKey, string> = {
  marginPctL: 'PlaymatSettings.crop.leftMargin',
  marginPctR: 'PlaymatSettings.crop.rightMargin',
  verticalOffset: 'PlaymatSettings.crop.verticalOffset',
  zoom: 'PlaymatSettings.crop.zoom',
};

export const asPercent = (value: number) => `${Math.round(value * 100)}`;
export const asDecimal = (value: number) => value.toFixed(2);

export const CROP_SLIDERS: readonly { key: CropKey; min: number; max: number; step: number; format: (value: number) => string }[] = [
  { key: 'marginPctL', min: 0, max: 0.95, step: 0.01, format: asPercent },
  { key: 'marginPctR', min: 0, max: 0.95, step: 0.01, format: asPercent },
  { key: 'verticalOffset', min: 0, max: 1, step: 0.01, format: asDecimal },
  { key: 'zoom', min: 0.1, max: 4, step: 0.05, format: asDecimal },
];
