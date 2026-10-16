import type { DocumentRole, GeneralAccess, WorkspaceRole } from '@draftroom/contract'
import { describe, expect, it } from 'vitest'
import {
  can,
  canInWorkspace,
  effectiveRole,
  verdictFor,
  type DocumentOperation,
  type WorkspaceOperation,
} from './permissions.ts'

type Grant = DocumentRole | null

describe('the effective role of a workspace member', () => {
  // Rows: the explicit grant. Columns: the document's general access. Each cell is the higher of the two.
  const generalAccess: readonly GeneralAccess[] = ['none', 'viewer', 'commenter', 'editor']
  const grid: readonly (readonly [Grant, readonly (DocumentRole | null)[]])[] = [
    [null, [null, 'viewer', 'commenter', 'editor']],
    ['viewer', ['viewer', 'viewer', 'commenter', 'editor']],
    ['commenter', ['commenter', 'commenter', 'commenter', 'editor']],
    ['editor', ['editor', 'editor', 'editor', 'editor']],
    ['owner', ['owner', 'owner', 'owner', 'owner']],
  ]

  it.each(
    grid.flatMap(([grant, roles]) => generalAccess.map((access, column) => [grant, access, roles[column]] as const)),
  )('with the grant %s and general access %s is %s', (grant, access, expected) => {
    expect(effectiveRole({ workspaceRole: 'member', grant, generalAccess: access })).toBe(expected)
  })
})

describe('the effective role of everyone else', () => {
  const everyGrant: readonly Grant[] = [null, 'viewer', 'commenter', 'editor', 'owner']
  const everyAccess: readonly GeneralAccess[] = ['none', 'viewer', 'commenter', 'editor']
  const combinations = everyGrant.flatMap((grant) => everyAccess.map((access) => [grant, access] as const))

  it.each(combinations)('is owner for a workspace owner, with the grant %s and general access %s', (grant, access) => {
    expect(effectiveRole({ workspaceRole: 'owner', grant, generalAccess: access })).toBe('owner')
  })

  it.each(combinations)(
    'is nothing outside the workspace, with the grant %s and general access %s',
    (grant, access) => {
      expect(effectiveRole({ workspaceRole: null, grant, generalAccess: access })).toBeNull()
    },
  )
})

// The matrix of plan §4.3 and ADR 0005, one row per line: the roles that may do the operation.
const documentRows: readonly (readonly [DocumentOperation, readonly DocumentRole[]])[] = [
  ['read', ['viewer', 'commenter', 'editor', 'owner']],
  ['write-content', ['editor', 'owner']],
  ['read-comments', ['viewer', 'commenter', 'editor', 'owner']],
  ['write-comments', ['commenter', 'editor', 'owner']],
  ['edit-own-comment', ['commenter', 'editor', 'owner']],
  ['delete-any-comment', ['owner']],
  ['rename-move', ['editor', 'owner']],
  ['create-version', ['editor', 'owner']],
  ['read-versions', ['viewer', 'commenter', 'editor', 'owner']],
  ['restore-version', ['owner']],
  ['manage-access', ['owner']],
  ['archive-delete', ['owner']],
  ['pin', ['viewer', 'commenter', 'editor', 'owner']],
]
const everyRole: readonly DocumentRole[] = ['viewer', 'commenter', 'editor', 'owner']

describe('what a document role may do', () => {
  it.each(
    documentRows.flatMap(([operation, allowed]) =>
      everyRole.map((role) => [operation, role, allowed.includes(role)] as const),
    ),
  )('%s as %s: %s', (operation, role, allowed) => {
    expect(can(role, operation)).toBe(allowed)
  })

  it.each(documentRows.map(([operation]) => operation))('refuses %s to a person with no role', (operation) => {
    expect(can(null, operation)).toBe(false)
  })

  it('refuses an operation the matrix does not list', () => {
    // Default deny, also for a name that slipped past the types.
    // @ts-expect-error `export-everything` is not an operation
    expect(can('owner', 'export-everything')).toBe(false)
  })
})

describe('what a workspace role may do', () => {
  const workspaceRows: readonly (readonly [WorkspaceOperation, readonly WorkspaceRole[]])[] = [
    ['workspace-read', ['member', 'owner']],
    ['create-content', ['member', 'owner']],
    ['rename-folder', ['member', 'owner']],
    ['delete-folder', ['owner']],
    ['manage-members', ['owner']],
    ['rename-workspace', ['owner']],
  ]
  const everyWorkspaceRole: readonly WorkspaceRole[] = ['member', 'owner']

  it.each(
    workspaceRows.flatMap(([operation, allowed]) =>
      everyWorkspaceRole.map((role) => [operation, role, allowed.includes(role)] as const),
    ),
  )('%s as %s: %s', (operation, role, allowed) => {
    expect(canInWorkspace(role, operation)).toBe(allowed)
  })

  it.each(workspaceRows.map(([operation]) => operation))('refuses %s outside the workspace', (operation) => {
    expect(canInWorkspace(null, operation)).toBe(false)
  })
})

describe('the verdict on a document', () => {
  const live = { archived: false }
  const archived = { archived: true }
  const lifecycle = { onArchived: true }
  const ordinary = { onArchived: false }

  it('is not-found for a person with no role, however the operation is asked', () => {
    expect(verdictFor({ role: null, ...live }, 'read', ordinary)).toBe('not-found')
    expect(verdictFor({ role: null, ...archived }, 'archive-delete', lifecycle)).toBe('not-found')
  })

  it('is forbidden, not not-found, for a reader whose role does not allow the operation', () => {
    expect(verdictFor({ role: 'viewer', ...live }, 'rename-move', ordinary)).toBe('forbidden')
    expect(verdictFor({ role: 'editor', ...live }, 'archive-delete', lifecycle)).toBe('forbidden')
  })

  it('allows what the role allows on a live document', () => {
    expect(verdictFor({ role: 'editor', ...live }, 'rename-move', ordinary)).toBe('allowed')
    expect(verdictFor({ role: 'owner', ...live }, 'archive-delete', lifecycle)).toBe('allowed')
  })

  it.each(['viewer', 'commenter', 'editor'] as const)('hides an archived document from a %s', (role) => {
    expect(verdictFor({ role, ...archived }, 'read', lifecycle)).toBe('not-found')
  })

  it('lets an owner use an archived document only for what applies to one', () => {
    expect(verdictFor({ role: 'owner', ...archived }, 'read', lifecycle)).toBe('allowed')
    expect(verdictFor({ role: 'owner', ...archived }, 'archive-delete', lifecycle)).toBe('allowed')
    expect(verdictFor({ role: 'owner', ...archived }, 'rename-move', ordinary)).toBe('not-found')
    expect(verdictFor({ role: 'owner', ...archived }, 'pin', ordinary)).toBe('not-found')
  })
})
