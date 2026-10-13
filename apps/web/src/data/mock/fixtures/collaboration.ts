import type { Schema } from '@draftroom/contract'
import { seedId } from '../ids.ts'
import { launchPlan, designReview, interviews, budget } from './documents.ts'
import { daniel, marta, sofia } from './people.ts'

export interface CommentRecord {
  id: string
  authorId: string
  body: string
  createdAt: string
  updatedAt: string
}

export interface ThreadRecord {
  id: string
  documentId: string
  status: Schema<'ThreadStatus'>
  anchor: Schema<'Anchor'>
  quote: string
  createdBy: string
  createdAt: string
  resolvedAt: string | null
  resolvedBy: string | null
  comments: CommentRecord[]
}

export interface VersionRecord {
  id: string
  documentId: string
  kind: Schema<'VersionKind'>
  label: string | null
  createdBy: string | null
  createdAt: string
  sizeBytes: number
}

export interface ActivityRecord {
  id: string
  type: Schema<'ActivityType'>
  createdAt: string
  actorId: string | null
  documentId: string
  targetUserId: string | null
}

const comment = (index: number, authorId: string, body: string, at: string): CommentRecord => ({
  id: seedId(6, index),
  authorId,
  body,
  createdAt: at,
  updatedAt: at,
})

// The anchors are encoded Yjs relative positions that only mean something against a live document. These keep the
// shape of the contract (two base64 strings); the collaboration mock decides what they point at.
const anchor = (start: string, end: string): Schema<'Anchor'> => ({ start, end })

export const threads: readonly ThreadRecord[] = [
  {
    id: seedId(5, 1),
    documentId: launchPlan.id,
    status: 'open',
    anchor: anchor('AQAKAA==', 'AQAYAQ=='),
    quote: 'once the pricing review is signed off',
    createdBy: sofia.id,
    createdAt: '2026-10-12T09:10:00.000Z',
    resolvedAt: null,
    resolvedBy: null,
    comments: [
      comment(1, sofia.id, 'Who signs it off? Finance has not seen the new tiers yet.', '2026-10-12T09:10:00.000Z'),
      comment(2, marta.id, 'I will ask for a slot on Thursday and update the date here.', '2026-10-12T11:40:00.000Z'),
    ],
  },
  {
    id: seedId(5, 2),
    documentId: launchPlan.id,
    status: 'resolved',
    anchor: anchor('AQAcAA==', 'AQAmAQ=='),
    quote: 'second week of November',
    createdBy: daniel.id,
    createdAt: '2026-10-10T14:00:00.000Z',
    resolvedAt: '2026-10-11T08:30:00.000Z',
    resolvedBy: marta.id,
    comments: [
      comment(3, daniel.id, 'Can we confirm this does not clash with the conference?', '2026-10-10T14:00:00.000Z'),
    ],
  },
  {
    id: seedId(5, 3),
    documentId: designReview.id,
    status: 'open',
    anchor: anchor('AQAEAA==', 'AQAPAQ=='),
    quote: 'dejar el selector de idioma en los ajustes',
    createdBy: marta.id,
    createdAt: '2026-10-12T17:45:00.000Z',
    resolvedAt: null,
    resolvedBy: null,
    comments: [
      comment(4, marta.id, '¿Y si lo dejamos también en la pantalla de inicio de sesión?', '2026-10-12T17:45:00.000Z'),
    ],
  },
]

const version = (
  index: number,
  documentId: string,
  kind: Schema<'VersionKind'>,
  createdAt: string,
  sizeBytes: number,
  createdBy: string | null,
  label: string | null = null,
): VersionRecord => ({ id: seedId(7, index), documentId, kind, label, createdBy, createdAt, sizeBytes })

export const versions: readonly VersionRecord[] = [
  version(1, launchPlan.id, 'auto', '2026-10-09T17:00:00.000Z', 3180, null),
  version(2, launchPlan.id, 'manual', '2026-10-11T09:00:00.000Z', 3544, marta.id, 'Before the pricing review'),
  version(3, launchPlan.id, 'auto', '2026-10-13T08:30:00.000Z', 3812, null),
  version(4, interviews.id, 'manual', '2026-10-09T13:00:00.000Z', 5120, marta.id, 'Draft for the team'),
]

const event = (
  index: number,
  type: Schema<'ActivityType'>,
  createdAt: string,
  actorId: string | null,
  documentId: string,
  targetUserId: string | null = null,
): ActivityRecord => ({ id: seedId(8, index), type, createdAt, actorId, documentId, targetUserId })

export const activity: readonly ActivityRecord[] = [
  event(1, 'document.created', '2026-09-14T09:00:00.000Z', marta.id, launchPlan.id),
  event(2, 'access.granted', '2026-09-14T09:30:00.000Z', marta.id, launchPlan.id, daniel.id),
  event(3, 'access.granted', '2026-09-15T10:00:00.000Z', marta.id, launchPlan.id, sofia.id),
  event(4, 'thread.created', '2026-10-10T14:00:00.000Z', daniel.id, launchPlan.id),
  event(5, 'thread.resolved', '2026-10-11T08:30:00.000Z', marta.id, launchPlan.id),
  event(6, 'version.created', '2026-10-11T09:00:00.000Z', marta.id, launchPlan.id),
  event(7, 'thread.created', '2026-10-12T09:10:00.000Z', sofia.id, launchPlan.id),
  event(8, 'thread.replied', '2026-10-12T11:40:00.000Z', marta.id, launchPlan.id),
  event(9, 'document.renamed', '2026-10-13T08:42:00.000Z', marta.id, launchPlan.id),
  event(10, 'document.created', '2026-10-07T15:00:00.000Z', daniel.id, designReview.id),
  event(11, 'general-access.changed', '2026-10-07T15:05:00.000Z', daniel.id, designReview.id),
  event(12, 'thread.created', '2026-10-12T17:45:00.000Z', marta.id, designReview.id),
  event(13, 'document.created', '2026-10-01T09:00:00.000Z', marta.id, budget.id),
  event(14, 'access.granted', '2026-10-02T08:00:00.000Z', marta.id, budget.id, daniel.id),
]
