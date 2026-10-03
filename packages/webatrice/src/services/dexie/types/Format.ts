export interface AllowedCount {
  /** A number, or `unlimited`. */
  max: string;
  label: string;
}

/** `<cardCondition field match value>`: one test a card must pass. */
export interface CardCondition {
  field: string;
  /** `equals`, `notEquals`, `contains`, `notContains` or `regex`. */
  match: string;
  value: string;
}

/** `<exception>`: cards matching every condition may break the count rules. */
export interface FormatException {
  /** A number, or `unlimited`. */
  maxCopies: string;
  conditions: CardCondition[];
}

export class Format {
  formatName: string;
  minDeckSize?: number;
  maxDeckSize?: number;
  maxSideboardSize?: number;
  allowedCounts?: AllowedCount[];
  exceptions?: FormatException[];
}
