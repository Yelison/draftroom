import { sql, type Kysely } from 'kysely'

// The contract orders the history and the versions by what the API writes, the instant to the millisecond, and then by
// `id`. PostgreSQL keeps microseconds, so the lists order by the instant cut to the millisecond (`db/milliseconds.ts`),
// and an index serves that order only if it holds the same expression. `date_trunc(text, timestamptz)` is not immutable
// (it depends on the session's time zone), so it cannot be indexed; cut on the instant in UTC, which is a `timestamp`,
// it can, and that is the expression the queries use.
//
// Measured on 125,000 events and 3,000 versions (EXPLAIN ANALYZE): with these indexes the pages come from the index in
// order with no sort (0.1 to 0.8 ms), where ordering by the cut instant over the old ones read the table and sorted it
// (5 to 330 ms).
//
// Two old indexes are dropped because nothing reads them any more: every query that used them (the history of the
// workspace with any filter, the history of a document, and the deletion of a document's events, which only needs the
// workspace and the document the new index starts with) plans on the new ones, checked with the old ones gone.
// `document_versions_document_idx` stays: the sweep that makes automatic versions asks for the newest version and the
// newest automatic one of a document by the whole instant (`newestVersionState`, `newestAutoVersionAt`), and without
// it those two read and sort every version of the document.
//
// Forward only (ADR 0009): going back is a new migration that creates the dropped indexes again, with the definitions of
// `0002` and `0005`.

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`create index activity_events_workspace_ms_idx on activity_events
    (workspace_id, (date_trunc('milliseconds', created_at at time zone 'UTC')) desc, id desc)`.execute(db)
  await sql`create index activity_events_document_ms_idx on activity_events
    (workspace_id, document_id, (date_trunc('milliseconds', created_at at time zone 'UTC')), id)`.execute(db)
  await sql`create index document_versions_document_ms_idx on document_versions
    (workspace_id, document_id, (date_trunc('milliseconds', created_at at time zone 'UTC')), id)`.execute(db)

  await sql`drop index activity_events_workspace_idx`.execute(db)
  await sql`drop index activity_events_document_idx`.execute(db)
}
