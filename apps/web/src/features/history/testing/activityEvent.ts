import { daniel, marta } from '../../../data/mock/fixtures/index.ts'
import { launchPlan } from '../../../data/mock/fixtures/documents.ts'
import type { ActivityEvent } from '../activityEvents.ts'

let counter = 0

/** An event of the history, by default Marta renaming the launch plan; whatever differs from that is said. */
export function activityEvent(createdAt: string, overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  counter += 1
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    type: 'document.renamed',
    createdAt,
    actor: { id: marta.id, name: marta.name ?? 'Marta Ruiz' },
    document: { id: launchPlan.id, title: launchPlan.title },
    targetUser: null,
    ...overrides,
  }
}

export const otherActor = { id: daniel.id, name: daniel.name ?? 'Daniel Okafor' }
