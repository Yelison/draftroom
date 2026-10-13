import type { Schema } from '@draftroom/contract'
import { seedId } from '../ids.ts'
import { daniel, marta, sofia } from './people.ts'
import { operationsFolder, productFolder, researchFolder, harborPine } from './workspaces.ts'

export interface DocumentRecord {
  id: string
  workspaceId: string
  folderId: string | null
  title: string
  excerpt: string | null
  revision: number
  generalAccess: Schema<'GeneralAccess'>
  createdBy: string
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export interface GrantRecord {
  documentId: string
  userId: string
  role: Schema<'DocumentRole'>
  createdAt: string
}

export interface PinRecord {
  userId: string
  documentId: string
}

const documentId = (index: number) => seedId(4, index)

interface DocumentInput {
  index: number
  folderId?: string
  title: string
  excerpt: string | null
  by: string
  general?: Schema<'GeneralAccess'>
  createdAt: string
  updatedAt: string
  archivedAt?: string
  revision?: number
}

const document = (input: DocumentInput): DocumentRecord => ({
  id: documentId(input.index),
  workspaceId: harborPine.id,
  folderId: input.folderId ?? null,
  title: input.title,
  excerpt: input.excerpt,
  revision: input.revision ?? 1,
  generalAccess: input.general ?? 'none',
  createdBy: input.by,
  createdAt: input.createdAt,
  updatedAt: input.updatedAt,
  archivedAt: input.archivedAt ?? null,
})

export const launchPlan = document({
  index: 1,
  folderId: productFolder.id,
  title: 'Autumn launch plan',
  excerpt: 'The launch moves to the second week of November, once the pricing review is signed off.',
  by: marta.id,
  general: 'commenter',
  createdAt: '2026-09-14T09:00:00.000Z',
  updatedAt: '2026-10-13T08:42:00.000Z',
  revision: 3,
})
export const designReview = document({
  index: 2,
  folderId: productFolder.id,
  title: 'Notas de la revisión de diseño',
  excerpt: 'Acordamos simplificar la barra lateral y dejar el selector de idioma en los ajustes.',
  by: daniel.id,
  general: 'viewer',
  createdAt: '2026-10-07T15:00:00.000Z',
  updatedAt: '2026-10-12T17:20:00.000Z',
  revision: 2,
})
export const weeklyEnglish = document({
  index: 3,
  title: 'Weekly update — October 6',
  excerpt: 'Onboarding emails are live. The billing migration is waiting on one decision from finance.',
  by: sofia.id,
  createdAt: '2026-10-06T16:00:00.000Z',
  updatedAt: '2026-10-11T10:00:00.000Z',
})
// Same instant as the one above on purpose: lists must keep these two in the order of their ids.
export const weeklySpanish = document({
  index: 4,
  title: 'Actualización semanal — 13 de octubre',
  excerpt: 'Los correos de bienvenida ya están activos. La migración de facturación espera una decisión de finanzas.',
  by: sofia.id,
  createdAt: '2026-10-07T07:30:00.000Z',
  updatedAt: '2026-10-11T10:00:00.000Z',
})
export const interviews = document({
  index: 5,
  folderId: researchFolder.id,
  title: 'Customer interview synthesis',
  excerpt: 'Teams keep their notes in three places. Nobody trusts the one that is meant to be the source.',
  by: marta.id,
  createdAt: '2026-09-22T11:00:00.000Z',
  updatedAt: '2026-10-09T13:15:00.000Z',
  revision: 4,
})
export const interviewsSpanish = document({
  index: 6,
  folderId: researchFolder.id,
  title: 'Síntesis de entrevistas con clientes',
  excerpt: 'Los equipos guardan sus notas en tres sitios y nadie se fía del que debería ser la fuente.',
  by: marta.id,
  general: 'viewer',
  createdAt: '2026-09-23T11:00:00.000Z',
  updatedAt: '2026-10-08T09:30:00.000Z',
})
export const brandVoice = document({
  index: 7,
  title: 'Brand voice guide',
  excerpt: 'We write the way we talk to a colleague: short sentences, no jargon, a little warmth.',
  by: daniel.id,
  general: 'editor',
  createdAt: '2026-08-18T10:00:00.000Z',
  updatedAt: '2026-10-05T14:00:00.000Z',
  revision: 6,
})
export const budget = document({
  index: 8,
  folderId: operationsFolder.id,
  title: 'Presupuesto 2027',
  excerpt: 'Hipótesis de contratación, herramientas y viajes para el próximo año.',
  by: marta.id,
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-10T18:00:00.000Z',
  revision: 2,
})
export const onboardingChecklist = document({
  index: 9,
  title: 'Onboarding checklist',
  excerpt: 'Accounts, equipment and the three people to meet in the first week.',
  by: sofia.id,
  general: 'commenter',
  createdAt: '2026-08-25T09:00:00.000Z',
  updatedAt: '2026-09-30T12:00:00.000Z',
})
export const onboardingGuide = document({
  index: 10,
  title: 'Guía de incorporación',
  excerpt: 'Cuentas, equipo y las tres personas que conocer durante la primera semana.',
  by: sofia.id,
  general: 'viewer',
  createdAt: '2026-08-26T09:00:00.000Z',
  updatedAt: '2026-09-29T12:00:00.000Z',
})
export const oldPricing = document({
  index: 11,
  folderId: productFolder.id,
  title: 'Old pricing draft',
  excerpt: 'Three tiers, with a free plan that we dropped after the first review.',
  by: marta.id,
  createdAt: '2026-08-30T09:00:00.000Z',
  updatedAt: '2026-09-18T09:00:00.000Z',
  archivedAt: '2026-09-18T09:00:00.000Z',
  revision: 5,
})
export const oldPricingSpanish = document({
  index: 12,
  title: 'Borrador de precios anterior',
  excerpt: null,
  by: daniel.id,
  createdAt: '2026-08-31T09:00:00.000Z',
  updatedAt: '2026-09-19T09:00:00.000Z',
  archivedAt: '2026-09-19T09:00:00.000Z',
  revision: 2,
})

export const documents: readonly DocumentRecord[] = [
  launchPlan,
  designReview,
  weeklyEnglish,
  weeklySpanish,
  interviews,
  interviewsSpanish,
  brandVoice,
  budget,
  onboardingChecklist,
  onboardingGuide,
  oldPricing,
  oldPricingSpanish,
]

const grant = (
  document: DocumentRecord,
  userId: string,
  role: Schema<'DocumentRole'>,
  createdAt = document.createdAt,
): GrantRecord => ({ documentId: document.id, userId, role, createdAt })

/** Everyone who made a document owns it; the rest are the explicit grants that make the roles differ. */
export const grants: readonly GrantRecord[] = [
  ...documents.map((seed) => grant(seed, seed.createdBy, 'owner')),
  grant(launchPlan, daniel.id, 'editor', '2026-09-14T09:30:00.000Z'),
  grant(launchPlan, sofia.id, 'commenter', '2026-09-15T10:00:00.000Z'),
  grant(weeklyEnglish, daniel.id, 'editor', '2026-10-06T16:30:00.000Z'),
  grant(interviews, sofia.id, 'commenter', '2026-09-22T12:00:00.000Z'),
  grant(budget, daniel.id, 'viewer', '2026-10-02T08:00:00.000Z'),
]

export const pins: readonly PinRecord[] = [
  { userId: marta.id, documentId: launchPlan.id },
  { userId: marta.id, documentId: interviews.id },
  { userId: daniel.id, documentId: launchPlan.id },
]
