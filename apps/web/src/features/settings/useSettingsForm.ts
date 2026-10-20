import { contractLimits, type Schema } from '@draftroom/contract'
import { useState, type SubmitEvent } from 'react'
import { type Locale } from '../../i18n/locale.ts'
import { useLocale } from '../../i18n/useLocale.ts'
import { textProblem, type TextProblem } from '../documents/actions/textProblem.ts'
import { useRenameWorkspace } from './useRenameWorkspace.ts'
import { useUpdateMe } from './useUpdateMe.ts'

interface Problems {
  name: TextProblem | null
  workspaceName: TextProblem | null
}

/**
 * The fields of the dialog that are kept with its Save button: the name and the language of the person and, for an owner,
 * the name of the workspace. A field shows what the server has until the person types, so that nothing is copied into
 * state before it is needed; the drafts go with the dialog when it closes.
 *
 * Two requests may leave from one press (the account and the workspace), and each one's answer belongs to its own fields.
 * Nothing is said to be saved until every request that left has been answered with success.
 */
export function useSettingsForm(me: Schema<'Me'> | undefined, workspace: Schema<'Workspace'> | null | undefined) {
  const { locale: appLocale } = useLocale()
  const updateMe = useUpdateMe()
  const rename = useRenameWorkspace()
  const [drafts, setDrafts] = useState<{ name?: string; locale?: Locale; workspaceName?: string }>({})
  const [problems, setProblems] = useState<Problems>({ name: null, workspaceName: null })

  // A person who has not chosen a language reads the one the browser gave them, and that is the one the group shows. It
  // is not saved until they say so: the account stays without a language, and saving writes the one in use.
  const name = drafts.name ?? me?.name ?? ''
  const locale = drafts.locale ?? me?.locale ?? appLocale
  const workspaceName = drafts.workspaceName ?? workspace?.name ?? ''
  const nameChanged = me !== undefined && name.trim() !== me.name
  const localeChanged = me !== undefined && locale !== me.locale
  // The server refuses anyone else; the interface only does not offer it.
  const canRename = workspace?.role === 'owner'
  const workspaceChanged = canRename && workspaceName.trim() !== workspace.name
  const changed = nameChanged || localeChanged || workspaceChanged
  const pending = updateMe.isPending || rename.isPending

  function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || !changed) return
    const found: Problems = {
      name: nameChanged ? textProblem(name, contractLimits.personName) : null,
      workspaceName: workspaceChanged ? textProblem(workspaceName, contractLimits.workspaceName) : null,
    }
    setProblems(found)
    if (found.name !== null || found.workspaceName !== null) return
    if (nameChanged || localeChanged) {
      updateMe.mutate({ ...(nameChanged ? { name: name.trim() } : {}), ...(localeChanged ? { locale } : {}) })
    }
    if (workspaceChanged) rename.mutate({ workspaceId: workspace.id, name: workspaceName.trim() })
  }

  return {
    name,
    locale,
    workspaceName,
    canRename,
    changed,
    pending,
    problems,
    /** Why a request was not stored, by the field it was for: the name when it was one of the changes, else the language. */
    failures: {
      name: nameChanged ? updateMe.error : null,
      language: nameChanged ? null : updateMe.error,
      workspaceName: rename.error,
    },
    saved: (updateMe.isSuccess || rename.isSuccess) && !changed && !updateMe.isError && !rename.isError,
    setName(next: string) {
      updateMe.reset()
      setProblems((current) => ({ ...current, name: null }))
      setDrafts((current) => ({ ...current, name: next }))
    },
    setLocale(next: Locale) {
      updateMe.reset()
      setDrafts((current) => ({ ...current, locale: next }))
    },
    setWorkspaceName(next: string) {
      rename.reset()
      setProblems((current) => ({ ...current, workspaceName: null }))
      setDrafts((current) => ({ ...current, workspaceName: next }))
    },
    save,
  }
}

export type SettingsForm = ReturnType<typeof useSettingsForm>
