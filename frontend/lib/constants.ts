// Single source of truth for the backend test count shown in marketing/UI copy.
// Keep in sync with the pytest suite (verified on PostgreSQL). Bumping this one
// constant updates every surface that cites the number, so the figure can't
// drift per-page again.
//
// Last verified: 355/355 passing on PostgreSQL 15 (commit on `main`).
export const TEST_COUNT = 355;
