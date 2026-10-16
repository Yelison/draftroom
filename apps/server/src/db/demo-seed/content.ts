import type { DocumentRole, GeneralAccess, WorkspaceRole } from '../tables.ts'

// The people and documents of the demo workspaces: one in English and one in Spanish, as the owner decided (Q6).
// Everything here is fictional, the addresses are on the reserved `.example` domain, and the titles read like what
// people really write. The documents hold no text yet: it is typed in the editor, and an excerpt that the content does
// not back would be a lie.

export interface DemoPerson {
  readonly id: string
  readonly email: string
  readonly name: string
}

export interface DemoDocument {
  readonly title: string
  readonly folder?: string
  readonly creator: string
  readonly generalAccess?: Exclude<GeneralAccess, 'none'>
  /** Explicit grants beyond the creator's own, by the email of the person. */
  readonly grants?: Readonly<Record<string, Exclude<DocumentRole, 'owner'>>>
  readonly pinnedBy?: readonly string[]
  readonly archived?: boolean
  /** How long ago it last changed (an archived document: was archived), which orders the lists. */
  readonly daysAgo: number
  /** How long ago it was created, when that was before its last change; as old as `daysAgo` when omitted. */
  readonly createdDaysAgo?: number
}

export interface DemoWorkspace {
  readonly id: string
  readonly name: string
  readonly members: readonly { readonly email: string; readonly role: WorkspaceRole }[]
  readonly folders: readonly string[]
  readonly documents: readonly DemoDocument[]
}

export const people = {
  marta: { id: '5b8f7a3e-2d4c-4e1b-8a6f-1c9d3e7b0a11', email: 'marta.ruiz@harborpine.example', name: 'Marta Ruiz' },
  daniel: {
    id: '6c9a8b4f-3e5d-4f2c-9b70-2d0e4f8c1b22',
    email: 'daniel.okafor@harborpine.example',
    name: 'Daniel Okafor',
  },
  priya: { id: '7dab9c50-4f6e-4a3d-8c81-3e1f5a9d2c33', email: 'priya.raman@harborpine.example', name: 'Priya Raman' },
  tom: { id: '8ebcad61-5a7f-4b4e-9d92-4f2a6bae3d44', email: 'tom.weller@harborpine.example', name: 'Tom Weller' },
  lucia: {
    id: '9fcdbe72-6b80-4c5f-8ea3-5a3b7cbf4e55',
    email: 'lucia.fernandez@almazara.example',
    name: 'Lucía Fernández',
  },
  mateo: { id: 'a0decf83-7c91-4d60-9fb4-6b4c8dc05f66', email: 'mateo.salazar@almazara.example', name: 'Mateo Salazar' },
  ximena: { id: 'b1efd094-8da2-4e71-80c5-7c5d9ed16077', email: 'ximena.arce@almazara.example', name: 'Ximena Arce' },
} as const satisfies Record<string, DemoPerson>

export const demoPeople: readonly DemoPerson[] = Object.values(people)

export const harborAndPine: DemoWorkspace = {
  id: '0b1f6d54-3c1a-4f55-9a43-6a7d2f5e8c01',
  name: 'Harbor & Pine',
  members: [
    { email: people.marta.email, role: 'owner' },
    { email: people.daniel.email, role: 'member' },
    { email: people.priya.email, role: 'member' },
    { email: people.tom.email, role: 'member' },
  ],
  folders: ['Launch', 'Client notes', 'Team'],
  documents: [
    {
      title: 'Autumn launch plan',
      folder: 'Launch',
      creator: people.marta.email,
      generalAccess: 'viewer',
      grants: { [people.priya.email]: 'editor' },
      pinnedBy: [people.marta.email, people.daniel.email],
      daysAgo: 0,
    },
    {
      title: 'Meeting notes, 4 November',
      folder: 'Team',
      creator: people.daniel.email,
      grants: { [people.priya.email]: 'commenter' },
      daysAgo: 1,
    },
    {
      title: 'Brand voice guidelines',
      folder: 'Launch',
      creator: people.priya.email,
      generalAccess: 'editor',
      daysAgo: 2,
    },
    {
      title: 'Q4 budget draft',
      creator: people.marta.email,
      grants: { [people.tom.email]: 'viewer' },
      pinnedBy: [people.tom.email],
      daysAgo: 4,
    },
    { title: 'Interview questions for the design role', folder: 'Team', creator: people.tom.email, daysAgo: 6 },
    {
      title: 'Notes from the Brightwater workshop',
      folder: 'Client notes',
      creator: people.daniel.email,
      generalAccess: 'viewer',
      daysAgo: 9,
    },
    { title: 'Press kit, 2025 edition', creator: people.marta.email, archived: true, daysAgo: 30, createdDaysAgo: 96 },
  ],
}

export const almazara: DemoWorkspace = {
  id: '1c2a7e65-4d2b-4a66-8b54-7b8e3a6f9d02',
  name: 'Cooperativa Almazara',
  members: [
    { email: people.lucia.email, role: 'owner' },
    { email: people.mateo.email, role: 'member' },
    { email: people.ximena.email, role: 'member' },
    { email: people.marta.email, role: 'member' },
  ],
  folders: ['Cosecha', 'Notas de clientes', 'Equipo'],
  documents: [
    {
      title: 'Plan de la cosecha de otoño',
      folder: 'Cosecha',
      creator: people.lucia.email,
      generalAccess: 'viewer',
      grants: { [people.mateo.email]: 'editor' },
      pinnedBy: [people.lucia.email, people.mateo.email],
      daysAgo: 0,
    },
    {
      title: 'Notas de la reunión con clientes',
      folder: 'Notas de clientes',
      creator: people.mateo.email,
      grants: { [people.ximena.email]: 'commenter' },
      daysAgo: 1,
    },
    {
      title: 'Guía de estilo de las etiquetas',
      folder: 'Equipo',
      creator: people.ximena.email,
      generalAccess: 'editor',
      daysAgo: 3,
    },
    {
      title: 'Presupuesto del cuarto trimestre',
      creator: people.lucia.email,
      grants: { [people.marta.email]: 'viewer' },
      daysAgo: 5,
    },
    { title: 'Borrador de la carta de precios', folder: 'Equipo', creator: people.mateo.email, daysAgo: 7 },
    {
      title: 'Catálogo de la temporada anterior',
      creator: people.lucia.email,
      archived: true,
      daysAgo: 40,
      createdDaysAgo: 120,
    },
  ],
}
