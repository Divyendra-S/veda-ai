/**
 * Query keys, in one place.
 *
 * Layer one of the three the data layer is built from: keys here, fetchers and
 * query options in `lib/queries/*`, hooks in `hooks/*`. Keys are centralised
 * because invalidation is the one place a typo is silent — a mutation that
 * invalidates `["exam", id]` while the query registered `["exams", id]` simply
 * never refetches, and nothing reports it.
 */
export const queryKeys = {
  exams: ["exams"] as const,
  exam: (id: string) => ["exams", id] as const,
};
