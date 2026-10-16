import type { Schema } from '@draftroom/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useDataSource } from '../../data/useDataSource.ts'
import { invalidateAfter } from '../documents/invalidate.ts'

type DocumentRole = Schema<'DocumentRole'>
type GeneralAccess = Schema<'GeneralAccess'>

/** What was done, as the screen says it: the person it was about by name, never by id. */
export type AccessChange =
  | { kind: 'added' | 'changed'; name: string; role: DocumentRole }
  | { kind: 'removed'; name: string }
  | { kind: 'general'; access: GeneralAccess }

export interface AccessChangesOptions {
  document: Pick<Schema<'Document'>, 'id' | 'workspaceId'>
  /** Called for every change the server accepted, once the lists it affects have been marked stale. */
  onDone: (change: AccessChange) => void
  onFailed: (error: Error) => void
}

/**
 * The four ways to change who can open a document. Each one marks stale exactly what the table of `docs/api/README.md`
 * names for it, and says what happened only when the server has said so. Only one runs at a time: the screen leaves the
 * controls alone while it does, so two answers never cross.
 */
export function useAccessChanges({ document, onDone, onFailed }: AccessChangesOptions) {
  const dataSource = useDataSource()
  const queryClient = useQueryClient()
  const path = { documentId: document.id }
  const scope = { workspaceId: document.workspaceId, documentId: document.id }

  const setRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: DocumentRole; name: string; kind: 'added' | 'changed' }) =>
      dataSource.setAccess({ params: { path: { ...path, userId } }, body: { role } }),
    onSuccess: async (_entry, { kind, name, role }) => {
      await invalidateAfter(queryClient, 'setAccess', scope)
      onDone({ kind, name, role })
    },
    onError: onFailed,
  })

  const remove = useMutation({
    mutationFn: ({ userId }: { userId: string; name: string }) =>
      dataSource.removeAccess({ params: { path: { ...path, userId } } }),
    onSuccess: async (_nothing, { name }) => {
      await invalidateAfter(queryClient, 'removeAccess', scope)
      onDone({ kind: 'removed', name })
    },
    onError: onFailed,
  })

  const setGeneral = useMutation({
    mutationFn: (generalAccess: GeneralAccess) =>
      dataSource.setGeneralAccess({ params: { path }, body: { generalAccess } }),
    onSuccess: async (_setting, access) => {
      await invalidateAfter(queryClient, 'setGeneralAccess', scope)
      onDone({ kind: 'general', access })
    },
    onError: onFailed,
  })

  return {
    setRole: setRole.mutate,
    remove: remove.mutate,
    setGeneral: setGeneral.mutate,
    busy: setRole.isPending || remove.isPending || setGeneral.isPending,
  }
}
