import type { Schema } from '@draftroom/contract'
import { seedId } from '../ids.ts'

export interface PersonRecord {
  id: string
  email: string
  /** `null` for someone who was invited and has not signed up. */
  name: string | null
  /** `null` for a person without an account. */
  password: string | null
  /** The language the person chose, or `null` while the browser's applies. */
  locale: Schema<'Locale'> | null
  editorTextSize: Schema<'EditorTextSize'>
}

/** The password of every demo account. */
export const demoPassword = 'harbor pine rooftop'

const userId = (index: number) => seedId(1, index)

export const marta: PersonRecord = {
  id: userId(1),
  email: 'marta@harborpine.example',
  name: 'Marta Ruiz',
  password: demoPassword,
  locale: null,
  editorTextSize: 'medium',
}
export const daniel: PersonRecord = {
  id: userId(2),
  email: 'daniel@harborpine.example',
  name: 'Daniel Okafor',
  password: demoPassword,
  locale: null,
  editorTextSize: 'medium',
}
export const sofia: PersonRecord = {
  id: userId(3),
  email: 'sofia@harborpine.example',
  name: 'Sofía Lindqvist',
  password: demoPassword,
  locale: null,
  editorTextSize: 'medium',
}
export const wei: PersonRecord = {
  id: userId(4),
  email: 'wei@lanternstudio.example',
  name: 'Wei Chen',
  password: demoPassword,
  locale: null,
  editorTextSize: 'medium',
}
/** Invited to Harbor Pine, with no account yet: a pending member. */
export const ana: PersonRecord = {
  id: userId(5),
  email: 'ana@harborpine.example',
  name: null,
  password: null,
  locale: null,
  editorTextSize: 'medium',
}

export const people: readonly PersonRecord[] = [marta, daniel, sofia, wei, ana]
