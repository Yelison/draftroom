import type { Kysely } from 'kysely'

// The history of a workspace reads its events newest first across all its documents, a page at a time. The index of
// `0002` leads with the document, so it serves one document and cannot give the events of many in date order: without
// this one the database reads every event of the workspace and sorts them to find the first twenty-five. With it, it
// walks the index from the newest event and stops when the page is full (measured at 120,000 events: a sequential scan
// and sort of about 70 ms against about 1 ms), whatever the filters of the caller leave out.

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createIndex('activity_events_workspace_idx')
    .on('activity_events')
    // The order of the list, so the same key serves the cursor `(created_at, id) < (…)`.
    .columns(['workspace_id', 'created_at desc', 'id desc'])
    .execute()
}
