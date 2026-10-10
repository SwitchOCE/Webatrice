export type CardSearchDockZone = 'main' | 'side';

export interface CardSearchDockProps {
  onAdd: (cardName: string, zone: CardSearchDockZone, providerId?: string) => void;
  onSelect?: (cardName: string) => void;
  colorIdentity?: readonly string[];
  format?: string;
}

export default function CardSearchDock(_props: CardSearchDockProps) {
  return null;
}
