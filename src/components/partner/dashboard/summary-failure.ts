/** Why the summary couldn't load, and a way to ask again: each tile that reads it shows its own error and Try again. */
export interface SummaryFailure {
  error: unknown;
  retry: () => void;
}
